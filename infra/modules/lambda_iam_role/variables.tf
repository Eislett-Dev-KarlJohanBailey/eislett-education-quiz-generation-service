variable "role_name" {
  description = "IAM role name for Lambda"
  type        = string
}

variable "attach_vpc_policy" {
  description = "Attach VPC access execution role"
  type        = bool
  default     = false
}

variable "dynamodb_table_arns" {
  description = "List of DynamoDB table ARNs Lambda can access"
  type        = list(string)
  default     = []
}

variable "additional_policy_arns" {
  description = "Extra IAM policies to attach"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "IAM role tags"
  type        = map(string)
  default     = {}
}
