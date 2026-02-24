import type { SQSHandler, SQSEvent } from "aws-lambda";
import { QuizRequestRepository } from "../infrastructure/repositories/quiz-request.repository";
import { OpenAIQuizClient } from "../infrastructure/openai.quiz.client";
import { UsageEventClient } from "../infrastructure/usage-event.client";

let openAIClient: OpenAIQuizClient | null = null;

async function getOpenAIClient(): Promise<OpenAIQuizClient> {
  if (!openAIClient) {
    openAIClient = new OpenAIQuizClient();
    const projectName = process.env.PROJECT_NAME ?? "eislett-education";
    const environment = process.env.ENVIRONMENT ?? "dev";
    await openAIClient.initialize(projectName, environment);
  }
  return openAIClient;
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const tableName = process.env.QUIZ_REQUESTS_TABLE;
  if (!tableName) {
    throw new Error("QUIZ_REQUESTS_TABLE is not set");
  }
  const usageQueueUrl = process.env.USAGE_EVENT_QUEUE_URL;
  if (!usageQueueUrl) {
    throw new Error("USAGE_EVENT_QUEUE_URL is not set");
  }

  const repository = new QuizRequestRepository(tableName);
  const usageClient = new UsageEventClient(usageQueueUrl);

  for (const record of event.Records) {
    let body: { id?: string; userId?: string };
    try {
      body = JSON.parse(record.body);
    } catch {
      console.error("Invalid SQS message body:", record.body);
      continue;
    }
    const id = body.id;
    const userId = body.userId;
    if (!id || !userId) {
      console.error("SQS message missing id or userId:", body);
      continue;
    }

    const quizRequest = await repository.findByUserIdAndId(userId, id);
    if (!quizRequest) {
      console.error("Quiz request not found:", { id, userId });
      continue;
    }
    if (quizRequest.status !== "queued") {
      console.log("Quiz request already processed:", { id, status: quizRequest.status });
      continue;
    }

    try {
      await repository.updateStatus(userId, id, "processing");
    } catch (err) {
      console.error("Failed to set status to processing:", err);
      throw err;
    }

    try {
      await usageClient.consumeOne(userId, id);
    } catch (err) {
      console.error("Failed to send usage consume event:", err);
      await repository.updateStatus(userId, id, "queued");
      throw err;
    }

    let questions;
    try {
      const client = await getOpenAIClient();
      questions = await client.generateQuestions({
        instruction: quizRequest.instruction,
        subtopics: quizRequest.subtopics,
        difficultyLevel: quizRequest.difficultyLevel,
        numberOfQuestions: quizRequest.numberOfQuestions,
        userId: quizRequest.userId,
      });
    } catch (err) {
      console.error("Quiz generation failed:", err);
      try {
        await usageClient.reimburseOne(userId, id);
      } catch (reimburseErr) {
        console.error("Failed to send usage reimburse event:", reimburseErr);
      }
      await repository.updateStatus(userId, id, "queued");
      throw err;
    }

    await repository.updateStatus(userId, id, "completed", questions);
  }
};
