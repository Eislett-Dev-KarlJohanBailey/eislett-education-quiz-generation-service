import type { APIGatewayProxyResult } from "aws-lambda";

export function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(error: unknown): APIGatewayProxyResult {
  console.error("Error:", error);
  const err = error as Error & { name?: string };
  if (err.name === "ValidationError") {
    return response(400, { error: "VALIDATION_ERROR", message: err.message });
  }
  if (err.name === "NotFoundError") {
    return response(404, { error: "NOT_FOUND", message: err.message });
  }
  if (err.name === "AuthenticationError") {
    return response(401, { error: "UNAUTHORIZED", message: err.message });
  }
  if (err.name === "UsageExhaustedError" || err.name === "PaymentRequiredError") {
    return response(402, { error: "PAYMENT_REQUIRED", message: err.message });
  }
  return response(500, {
    error: "INTERNAL_ERROR",
    message: err.message || "An unexpected error occurred",
  });
}
