data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

resource "aws_api_gateway_resource" "base" {
  for_each    = var.paths
  rest_api_id = var.api_gateway_id
  parent_id   = var.api_gateway_root_id
  path_part   = each.value
}

resource "aws_api_gateway_resource" "proxy" {
  for_each    = var.paths
  rest_api_id = var.api_gateway_id
  parent_id   = aws_api_gateway_resource.base[each.key].id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "base" {
  for_each      = var.paths
  rest_api_id   = var.api_gateway_id
  resource_id   = aws_api_gateway_resource.base[each.key].id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "proxy" {
  for_each      = var.paths
  rest_api_id   = var.api_gateway_id
  resource_id   = aws_api_gateway_resource.proxy[each.key].id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "base" {
  for_each                = var.paths
  rest_api_id             = var.api_gateway_id
  resource_id             = aws_api_gateway_resource.base[each.key].id
  http_method             = aws_api_gateway_method.base[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arn}/invocations"
}

resource "aws_api_gateway_integration" "proxy" {
  for_each                = var.paths
  rest_api_id             = var.api_gateway_id
  resource_id             = aws_api_gateway_resource.proxy[each.key].id
  http_method             = aws_api_gateway_method.proxy[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arn}/invocations"
}

resource "aws_lambda_permission" "api_gateway" {
  for_each = var.paths

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "arn:aws:execute-api:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${var.api_gateway_id}/*/*/${each.key}*"
}
