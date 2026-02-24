import {
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

export class QuizGenerationSqsClient {
  private readonly queueUrl: string;
  private readonly client: SQSClient;

  constructor(queueUrl: string) {
    if (!queueUrl) {
      throw new Error("QUIZ_GENERATION_QUEUE_URL environment variable is not set");
    }
    this.queueUrl = queueUrl;
    this.client = new SQSClient({});
  }

  async sendQuizJob(payload: { id: string; userId: string }): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }
}
