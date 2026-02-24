import { QuizRequestRepository } from "../../infrastructure/repositories/quiz-request.repository";
import type { Pagination, PaginatedResult } from "../../infrastructure/repositories/quiz-request.repository";
import type { QuizRequest } from "../../domain/types/quiz-request.types";

export interface ListQuizRequestsInput {
  userId: string;
  pagination: Pagination;
}

export class ListQuizRequestsUseCase {
  constructor(private readonly repository: QuizRequestRepository) {}

  async execute(input: ListQuizRequestsInput): Promise<PaginatedResult<QuizRequest>> {
    return this.repository.listByUserId(input.userId, input.pagination);
  }
}
