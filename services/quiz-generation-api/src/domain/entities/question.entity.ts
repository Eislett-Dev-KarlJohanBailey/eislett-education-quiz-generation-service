import { Entity } from "./entity";

export interface MultipleChoiceOption {
  content: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface SimpleShortAnswersOption {
  content: string;
  marks: number;
  explanation?: string;
}

export default interface Question extends Entity {
  title: string;
  description?: string;
  content: string;
  tags: string[];
  totalPotentialMarks: number;
  difficultyLevel: number;
  subTopics?: string[];
  explanation?: string;
  mediaUrl?: string;
  mediaAlt?: string;
  hidden?: boolean;
  vectorStoreFileId?: string;
  vectorStoreProvider?: string;
  type?: string;
  options?: MultipleChoiceOption[];
  isTrue?: boolean;
  shortAnswers?: SimpleShortAnswersOption[];
  madeById?: string;
  userType?: "teacher" | "admin" | "student";
}
