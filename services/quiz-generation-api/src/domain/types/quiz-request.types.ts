import type Question from "../entities/question.entity";

export type QuizRequestStatus = "queued" | "processing" | "completed" | "failed";

export interface QuizGenerationRequestInput {
  instruction: string;
  subtopics: string[];
  difficultyLevel: number; // 0-1
  numberOfQuestions: number;
}

export interface QuizRequest {
  id: string;
  userId: string;
  instruction: string;
  subtopics: string[];
  difficultyLevel: number;
  numberOfQuestions: number;
  status: QuizRequestStatus;
  questions?: Question[];
  createdAt: string;
  updatedAt: string;
}
