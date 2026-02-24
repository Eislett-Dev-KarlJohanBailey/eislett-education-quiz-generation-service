output "resource_ids" {
  value = {
    for k in var.paths :
    "/${k}" => aws_api_gateway_resource.base[k].id
  }
}

output "proxy_resource_ids" {
  value = {
    for k in var.paths :
    "/${k}/{proxy+}" => aws_api_gateway_resource.proxy[k].id
  }
}

output "integration_ids" {
  value = {
    for k in var.paths :
    "/${k}" => aws_api_gateway_integration.base[k].id
  }
}
