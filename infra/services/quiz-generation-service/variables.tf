variable "state_bucket_name" {
  type = string
}

variable "state_region" {
  type = string
}

variable "state_bucket_key" {
  type = string
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "project_name" {
  type        = string
  description = "Project name prefix for resource naming"
  default     = "eislett-education"
}

variable "access_service_state_bucket" {
  type        = string
  default     = ""
  description = "S3 bucket for access-service Terraform state. Defaults to state_bucket_name when empty."
}

variable "access_service_state_key" {
  type        = string
  description = "S3 key for access-service Terraform state (for entitlements table name/ARN)"
}

variable "access_service_state_region" {
  type        = string
  default     = ""
  description = "AWS region for access-service state bucket. Defaults to state_region when empty."
}

variable "usage_event_queue_url" {
  type        = string
  description = "URL of the usage-event SQS queue (e.g. https://sqs.us-east-1.amazonaws.com/123456789012/project-env-usage-event-queue). Used for worker Lambda env and IAM (ARN derived from URL)."
}
