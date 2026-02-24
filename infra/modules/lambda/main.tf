resource "aws_lambda_function" "this" {
  function_name   = var.function_name
  handler         = var.handler
  runtime         = var.runtime
  filename        = var.filename
  role            = var.iam_role_arn
  timeout         = var.timeout
  source_code_hash = filebase64sha256(var.filename)

  environment {
    variables = var.environment_variables
  }
}

output "function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.this.arn
}

output "function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.this.function_name
}
