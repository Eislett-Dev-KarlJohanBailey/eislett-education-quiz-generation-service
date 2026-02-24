import { QuizRequestRepository } from "../../infrastructure/repositories/quiz-request.repository";
import type { QuizRequest } from "../../domain/types/quiz-request.types";

export interface GetQuizRequestInput {
  userId: string;
  id: string;
}

export class GetQuizRequestUseCase {
  constructor(private readonly repository: QuizRequestRepository) {}

  async execute(input: GetQuizRequestInput): Promise<QuizRequest | null> {
    return this.repository.findByUserIdAndId(input.userId, input.id);
  }
}
