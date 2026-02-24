output "quiz_requests_table_name" {
  value       = aws_dynamodb_table.quiz_requests.name
  description = "Name of the quiz generation requests DynamoDB table"
}

output "quiz_requests_table_arn" {
  value       = aws_dynamodb_table.quiz_requests.arn
  description = "ARN of the quiz generation requests DynamoDB table"
}

output "quiz_generation_queue_url" {
  value       = aws_sqs_queue.quiz_generation.url
  description = "URL of the quiz generation SQS queue"
}

output "quiz_generation_queue_arn" {
  value       = aws_sqs_queue.quiz_generation.arn
  description = "ARN of the quiz generation SQS queue"
}
