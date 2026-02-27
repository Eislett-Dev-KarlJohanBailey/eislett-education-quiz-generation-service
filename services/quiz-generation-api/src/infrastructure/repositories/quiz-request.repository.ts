import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { QuizRequest } from "../../domain/types/quiz-request.types";

export interface Pagination {
  pageNumber: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export class QuizRequestRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("QUIZ_REQUESTS_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async save(request: QuizRequest): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${request.userId}`,
          SK: `QUIZ#${request.id}`,
          id: request.id,
          userId: request.userId,
          title: request.title,
          instruction: request.instruction,
          subtopics: request.subtopics,
          difficultyLevel: request.difficultyLevel,
          numberOfQuestions: request.numberOfQuestions,
          status: request.status,
          questions: request.questions,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
        },
      })
    );
  }

  async listByUserId(
    userId: string,
    pagination: Pagination
  ): Promise<PaginatedResult<QuizRequest>> {
    const { pageNumber, pageSize } = pagination;
    if (pageNumber < 1) {
      throw new Error("pageNumber must be >= 1");
    }
    const limit = Math.min(pageSize * pageNumber, 500);
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        Limit: limit,
      })
    );
    const items = (result.Items || []).map((item) => this.mapToDomain(item));
    items.sort((a, b) => {
      const t1 = new Date(b.createdAt).getTime();
      const t2 = new Date(a.createdAt).getTime();
      return t1 - t2;
    });
    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = items.slice(startIndex, endIndex);
    return {
      items: paginatedItems,
      total: items.length,
      hasMore: endIndex < items.length,
    };
  }

  async findByUserIdAndId(userId: string, id: string): Promise<QuizRequest | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `QUIZ#${id}`,
        },
      })
    );
    if (result.Item) {
      return this.mapToDomain(result.Item);
    }
    return null;
  }

  async updateStatus(
    userId: string,
    id: string,
    status: QuizRequest["status"],
    questions?: QuizRequest["questions"]
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateExpr =
      questions !== undefined
        ? "SET #status = :status, questions = :questions, updatedAt = :updatedAt"
        : "SET #status = :status, updatedAt = :updatedAt";
    const exprValues: Record<string, unknown> = {
      ":status": status,
      ":updatedAt": now,
    };
    if (questions !== undefined) {
      exprValues[":questions"] = questions;
    }
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `QUIZ#${id}`,
        },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: exprValues,
      })
    );
  }

  private mapToDomain(item: Record<string, unknown>): QuizRequest {
    return {
      id: item.id as string,
      userId: item.userId as string,
      title: typeof item.title === "string" ? item.title : (item.instruction as string)?.slice(0, 80) || "Quiz",
      instruction: item.instruction as string,
      subtopics: (item.subtopics as string[]) || [],
      difficultyLevel: (item.difficultyLevel as number) ?? 0,
      numberOfQuestions: (item.numberOfQuestions as number) ?? 0,
      status: (item.status as QuizRequest["status"]) || "queued",
      questions: item.questions as QuizRequest["questions"],
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
  }
}
