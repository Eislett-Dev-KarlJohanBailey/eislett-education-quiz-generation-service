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

variable "access_service_state_key" {
  type        = string
  description = "S3 key for access-service Terraform state (for entitlements table name/ARN)"
}

variable "usage_event_queue_url" {
  type        = string
  description = "URL of the usage-event SQS queue (e.g. https://sqs.us-east-1.amazonaws.com/123456789012/project-env-usage-event-queue). Used for worker Lambda env and IAM (ARN derived from URL)."
}
