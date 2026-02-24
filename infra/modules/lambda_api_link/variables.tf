variable "api_gateway_id" {
  type        = string
  description = "API Gateway REST API ID"
}

variable "api_gateway_root_id" {
  type        = string
  description = "API Gateway root resource ID"
}

variable "lambda_function_arn" {
  type        = string
  description = "Lambda ARN"
}

variable "lambda_function_name" {
  type        = string
  description = "Lambda name"
}

variable "paths" {
  description = "Base paths to route to this Lambda (e.g. [\"quiz-generation\"])"
  type        = set(string)
}
