import type Question from "../entities/question.entity";

export type QuizRequestStatus = "queued" | "processing" | "completed" | "failed";

export interface QuizRequestRecord {
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
