terraform {
  backend "s3" {
    bucket         = "placeholder"
    key            = "placeholder"
    region         = "us-east-1"
    dynamodb_table = "placeholder"
    encrypt        = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

provider "aws" {
  region = "us-east-1"
}

data "terraform_remote_state" "foundation" {
  backend = "s3"

  config = {
    bucket = var.state_bucket_name
    key    = var.state_bucket_key
    region = var.state_region
  }
}

data "terraform_remote_state" "access_service" {
  backend = "s3"

  config = {
    bucket = var.access_service_state_bucket != "" ? var.access_service_state_bucket : var.state_bucket_name
    key    = var.access_service_state_key
    region = var.access_service_state_region != "" ? var.access_service_state_region : var.state_region
  }
}

# Derive usage event queue ARN from URL for IAM (https://sqs.{region}.amazonaws.com/{account_id}/{queue_name} -> arn:aws:sqs:{region}:{account_id}:{queue_name})
locals {
  usage_event_queue_parts = regexall("^https://sqs\\.([^.]+)\\.amazonaws\\.com/([0-9]+)/(.+)$", var.usage_event_queue_url)[0]
  usage_event_queue_arn   = "arn:aws:sqs:${local.usage_event_queue_parts[1]}:${local.usage_event_queue_parts[2]}:${local.usage_event_queue_parts[3]}"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.project_name}-${var.environment}-openai-api-key"
}

data "aws_secretsmanager_secret" "jwt_access_token_secret" {
  name = "${var.project_name}-${var.environment}-jwt-access-token-secret"
}

data "aws_secretsmanager_secret_version" "jwt_access_token_secret" {
  secret_id = data.aws_secretsmanager_secret.jwt_access_token_secret.id
}

locals {
  jwt_access_token_secret = try(
    jsondecode(data.aws_secretsmanager_secret_version.jwt_access_token_secret.secret_string)["key"],
    data.aws_secretsmanager_secret_version.jwt_access_token_secret.secret_string
  )
}

# DynamoDB Table for Quiz Generation Requests (per-user, status, questions when completed)
resource "aws_dynamodb_table" "quiz_requests" {
  name         = "${var.project_name}-${var.environment}-quiz-generation-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Service     = "quiz-generation-service"
    Name        = "Quiz Generation Requests Table"
  }
}

# SQS Queue for quiz generation jobs
resource "aws_sqs_queue" "quiz_generation" {
  name                       = "${var.project_name}-${var.environment}-quiz-generation-queue"
  visibility_timeout_seconds  = 120
  message_retention_seconds   = 86400
  receive_wait_timeout_seconds = 20

  tags = {
    Environment = var.environment
    Service     = "quiz-generation-service"
  }
}

# IAM Role for API Lambda (DynamoDB quiz_requests + entitlements read, SQS SendMessage)
module "quiz_generation_api_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "quiz-generation-api-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.quiz_requests.arn,
    data.terraform_remote_state.access_service.outputs.entitlements_table_arn,
    "${data.terraform_remote_state.access_service.outputs.entitlements_table_arn}/index/*",
  ]

  additional_policy_arns = []

  tags = {
    Environment = var.environment
    Service     = "quiz-generation-api"
  }
}

resource "aws_iam_role_policy" "api_sqs_send" {
  name   = "quiz-generation-api-sqs-send-${var.environment}"
  role   = module.quiz_generation_api_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = aws_sqs_queue.quiz_generation.arn
    }]
  })
}

resource "aws_iam_role_policy" "api_secrets_manager" {
  name = "quiz-generation-api-secrets-manager-${var.environment}"
  role = module.quiz_generation_api_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [
        data.aws_secretsmanager_secret.jwt_access_token_secret.arn
      ]
    }]
  })
}

# API Lambda: POST /quiz-generation, GET /quiz-generation/:id
module "quiz_generation_api_lambda" {
  source = "../../modules/lambda"

  function_name = "quiz-generation-api-${var.environment}"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  timeout       = 29
  filename      = abspath("${path.module}/../../../services/quiz-generation-api/function.zip")
  iam_role_arn  = module.quiz_generation_api_iam_role.role_arn

  environment_variables = {
    QUIZ_REQUESTS_TABLE     = aws_dynamodb_table.quiz_requests.name
    QUIZ_GENERATION_QUEUE_URL = aws_sqs_queue.quiz_generation.url
    ENTITLEMENTS_TABLE      = data.terraform_remote_state.access_service.outputs.entitlements_table_name
    PROJECT_NAME            = var.project_name
    ENVIRONMENT             = var.environment
    JWT_ACCESS_TOKEN_SECRET = local.jwt_access_token_secret
  }
}

module "lambda_api_link" {
  source               = "../../modules/lambda_api_link"
  api_gateway_id       = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id  = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.quiz_generation_api_lambda.function_arn
  lambda_function_name = module.quiz_generation_api_lambda.function_name
  paths                = ["quiz-generation"]
}

# IAM Role for Worker Lambda (DynamoDB + SQS Receive/Delete + Secrets Manager OpenAI)
module "quiz_generation_worker_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "quiz-generation-worker-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.quiz_requests.arn,
  ]

  additional_policy_arns = []

  tags = {
    Environment = var.environment
    Service     = "quiz-generation-worker"
  }
}

resource "aws_iam_role_policy" "worker_sqs" {
  name   = "quiz-generation-worker-sqs-${var.environment}"
  role   = module.quiz_generation_worker_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.quiz_generation.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = local.usage_event_queue_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "worker_secrets_manager" {
  name = "quiz-generation-worker-secrets-manager-${var.environment}"
  role = module.quiz_generation_worker_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = data.aws_secretsmanager_secret.openai_api_key.arn
    }])
  })
}

# Worker Lambda: SQS consumer, generates quiz, updates DynamoDB
module "quiz_generation_worker_lambda" {
  source = "../../modules/lambda"

  function_name = "quiz-generation-worker-${var.environment}"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  timeout       = 120
  filename      = abspath("${path.module}/../../../services/quiz-generation-worker/function.zip")
  iam_role_arn  = module.quiz_generation_worker_iam_role.role_arn

  environment_variables = {
    QUIZ_REQUESTS_TABLE    = aws_dynamodb_table.quiz_requests.name
    USAGE_EVENT_QUEUE_URL  = var.usage_event_queue_url
    PROJECT_NAME           = var.project_name
    ENVIRONMENT            = var.environment
  }
}

resource "aws_lambda_event_source_mapping" "quiz_generation_queue" {
  event_source_arn = aws_sqs_queue.quiz_generation.arn
  function_name    = module.quiz_generation_worker_lambda.function_name
  batch_size       = 1
  enabled          = true
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}
