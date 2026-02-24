import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export const FEATURE_QUIZ_GENERATION_KEY = "feature-quiz-generation";

export interface UsageEventPayload {
  userId: string;
  entitlementKey: string;
  amount: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export class UsageEventClient {
  private readonly queueUrl: string;
  private readonly client: SQSClient;

  constructor(queueUrl: string) {
    if (!queueUrl) {
      throw new Error("USAGE_EVENT_QUEUE_URL environment variable is not set");
    }
    this.queueUrl = queueUrl;
    this.client = new SQSClient({});
  }

  async send(payload: UsageEventPayload): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }

  async consumeOne(userId: string, idempotencyKey: string): Promise<void> {
    await this.send({
      userId,
      entitlementKey: FEATURE_QUIZ_GENERATION_KEY,
      amount: 1,
      idempotencyKey,
      metadata: { source: "quiz-generation-worker" },
    });
  }

  async reimburseOne(userId: string, idempotencyKey: string): Promise<void> {
    await this.send({
      userId,
      entitlementKey: FEATURE_QUIZ_GENERATION_KEY,
      amount: -1,
      idempotencyKey: `${idempotencyKey}-reimburse`,
      metadata: { source: "quiz-generation-worker", reason: "generation_failed" },
    });
  }
}
