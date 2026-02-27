import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { QuizRequestRecord } from "../../domain/types/quiz-request.types";
import type Question from "../../domain/entities/question.entity";

export class QuizRequestRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("QUIZ_REQUESTS_TABLE is not set");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async findByUserIdAndId(userId: string, id: string): Promise<QuizRequestRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${userId}`, SK: `QUIZ#${id}` },
      })
    );
    if (!result.Item) return null;
    return this.mapToDomain(result.Item);
  }

  async updateStatus(
    userId: string,
    id: string,
    status: QuizRequestRecord["status"],
    questions?: Question[]
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
      exprValues[":questions"] = JSON.parse(JSON.stringify(questions));
    }
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${userId}`, SK: `QUIZ#${id}` },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: exprValues,
      })
    );
  }

  private mapToDomain(item: Record<string, unknown>): QuizRequestRecord {
    return {
      id: item.id as string,
      userId: item.userId as string,
      title: typeof item.title === "string" ? item.title : (item.instruction as string)?.slice(0, 80) || "Quiz",
      instruction: item.instruction as string,
      subtopics: (item.subtopics as string[]) || [],
      difficultyLevel: (item.difficultyLevel as number) ?? 0,
      numberOfQuestions: (item.numberOfQuestions as number) ?? 0,
      status: (item.status as QuizRequestRecord["status"]) || "queued",
      questions: item.questions as QuizRequestRecord["questions"],
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
  }
}
