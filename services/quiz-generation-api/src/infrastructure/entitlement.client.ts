import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export const FEATURE_QUIZ_GENERATION_KEY = "feature-quiz-generation";

export interface EntitlementCheckResult {
  hasAccess: boolean;
  canConsumeOne: boolean;
  limit?: number;
  used?: number;
}

export class EntitlementClient {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("ENTITLEMENTS_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async checkQuizGenerationAccess(userId: string): Promise<EntitlementCheckResult> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `ENTITLEMENT#${FEATURE_QUIZ_GENERATION_KEY}`,
        },
      })
    );

    const item = result.Item as Record<string, unknown> | undefined;
    if (!item) {
      return { hasAccess: false, canConsumeOne: false };
    }

    const status = item.status as string | undefined;
    if (status !== "ACTIVE") {
      return { hasAccess: false, canConsumeOne: false };
    }

    const expiresAt = item.expiresAt as string | undefined;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return { hasAccess: false, canConsumeOne: false };
    }

    const usage = item.usage as { limit?: number; used?: number; permanentLimit?: number } | undefined;
    if (!usage) {
      return { hasAccess: true, canConsumeOne: false };
    }

    const limit = Number(usage.limit) || 0;
    const used = Number(usage.used) || 0;
    const permanentLimit = Number(usage.permanentLimit) || 0;
    const effectiveLimit = limit + permanentLimit;
    const canConsumeOne = used + 1 <= effectiveLimit;

    return {
      hasAccess: true,
      canConsumeOne,
      limit: effectiveLimit,
      used,
    };
  }
}
