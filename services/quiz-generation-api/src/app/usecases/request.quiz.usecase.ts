import { QuizRequestRepository } from "../../infrastructure/repositories/quiz-request.repository";
import { QuizGenerationSqsClient } from "../../infrastructure/sqs.client";
import type { QuizGenerationRequestInput } from "../../domain/types/quiz-request.types";

export interface RequestQuizInput extends QuizGenerationRequestInput {
  userId: string;
}

export class RequestQuizUseCase {
  constructor(
    private readonly repository: QuizRequestRepository,
    private readonly sqs: QuizGenerationSqsClient
  ) {}

  async execute(input: RequestQuizInput): Promise<{ id: string; status: string }> {
    const id = `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const now = new Date().toISOString();
    const title =
      (typeof input.title === "string" && input.title.trim()) || input.instruction.trim().slice(0, 80) || "Quiz";

    await this.repository.save({
      id,
      userId: input.userId,
      title,
      instruction: input.instruction,
      subtopics: input.subtopics ?? [],
      difficultyLevel: Math.min(1, Math.max(0, Number(input.difficultyLevel))),
      numberOfQuestions: Math.max(1, Math.min(50, Number(input.numberOfQuestions) || 1)),
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await this.sqs.sendQuizJob({ id, userId: input.userId });

    return { id, status: "queued" };
  }
}
