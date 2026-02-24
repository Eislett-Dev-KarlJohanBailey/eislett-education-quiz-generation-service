import type { APIGatewayProxyEvent } from "aws-lambda";
import jwt from "jsonwebtoken";

export interface JwtUser {
  id: string;
  role?: string;
}

function extractBearerToken(event: APIGatewayProxyEvent): string | null {
  const headers = event.headers || {};
  const authHeader = headers.Authorization || headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

export function getCurrentUserFromEvent(event: APIGatewayProxyEvent): JwtUser | null {
  try {
    const token = extractBearerToken(event);
    if (!token) return null;
    const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
    if (!secret) return null;
    const decoded = jwt.verify(token, secret) as JwtUser;
    if (!decoded?.id) return null;
    return { id: decoded.id, role: decoded.role };
  } catch {
    return null;
  }
}

export function requireUser(event: APIGatewayProxyEvent): JwtUser {
  const user = getCurrentUserFromEvent(event);
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { name: string }).name = "AuthenticationError";
    throw err;
  }
  return user;
}
