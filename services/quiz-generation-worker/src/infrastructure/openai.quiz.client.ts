import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import type Question from "../domain/entities/question.entity";

export interface GenerateQuizInput {
  instruction: string;
  subtopics: string[];
  difficultyLevel: number;
  numberOfQuestions: number;
  userId: string;
}

export class OpenAIQuizClient {
  private apiKey: string | null = null;

  async initialize(projectName: string, environment: string): Promise<void> {
    const secretName = `${projectName}-${environment}-openai-api-key`;
    const client = new SecretsManagerClient({ region: "us-east-1" });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    const secretString = response.SecretString || "";
    try {
      const parsed = JSON.parse(secretString) as Record<string, unknown>;
      const key = parsed.key ?? parsed.apiKey ?? secretString;
      this.apiKey = typeof key === "string" ? key : String(key);
    } catch {
      this.apiKey = secretString;
    }
  }

  async generateQuestions(input: GenerateQuizInput): Promise<Question[]> {
    if (!this.apiKey) throw new Error("OpenAIQuizClient not initialized");

    const difficultyLabel =
      input.difficultyLevel <= 0.33 ? "easy" : input.difficultyLevel <= 0.66 ? "medium" : "hard";
    const systemPrompt = `You are an expert educational quiz generator. Generate exactly ${input.numberOfQuestions} quiz questions as a JSON array. Each question MUST conform to this TypeScript interface (use these exact property names):

interface MultipleChoiceOption {
  content: string;
  isCorrect: boolean;
  explanation?: string;
}

interface SimpleShortAnswersOption {
  content: string;
  marks: number;
  explanation?: string;
}

interface Question {
  id?: string;
  createdAt: string;  // ISO date string
  title: string;
  description?: string;
  content: string;
  tags: string[];
  totalPotentialMarks: number;
  difficultyLevel: number;  // 1-10 scale (map from 0-1: 1-10)
  subTopics?: string[];
  explanation?: string;
  type?: "multiple-choice" | "true-false" | "short-answer";
  options?: MultipleChoiceOption[];   // for multiple-choice
  isTrue?: boolean;                   // for true-false
  shortAnswers?: SimpleShortAnswersOption[];  // for short-answer
  madeById?: string;
  userType?: "teacher" | "admin" | "student";
}

Rules:
- difficultyLevel: convert 0-1 to 1-10 (e.g. 0.5 -> 5). Use integer.
- totalPotentialMarks: integer, typically 1-10 per question.
- tags: array of strings relevant to the topic.
- SYMBOLS: Use proper mathematical and scientific symbols in all question content, options, and explanations. Do not use ASCII substitutes. Use: × for multiplication (not *), ÷ for division (not /), ± for plus-minus, ≠ for not equal, ≤ and ≥ for less/greater than or equal, ≈ for approximately, √ for square root, π for pi, ∞ for infinity, ° for degrees, ² and ³ for squared/cubed where appropriate, proper fractions (e.g. ½) when it improves clarity, and standard symbols for sets (∈, ∉, ∪, ∩), logic (∧, ∨, ¬), arrows (→, ⇒, ↔), and Greek letters (α, β, θ, Σ, Δ) when relevant to the topic. Apply this to any subject that uses notation (math, science, etc.).
- QUESTION TYPES (you MUST use a mix): Vary question types across the quiz. Include multiple-choice, true-false, and short-answer. Do not return only short-answer. For example: use multiple-choice for "choose the best answer" style, true-false for factual claims, short-answer only when a brief written answer is appropriate.
- For multiple-choice: set type to "multiple-choice" and include "options" (array of { content, isCorrect, explanation? }). At least one option must have isCorrect: true.
- For true-false: set type to "true-false" and include "isTrue" (boolean). Content should be a statement that is either true or false.
- For short-answer: set type to "short-answer" and include "shortAnswers" with content, marks, and optionally explanation.
- Every question MUST have "type" set to one of "multiple-choice" | "true-false" | "short-answer".
- Include "explanation" on the question when it helps.
- Set madeById to the userId when provided.
- Return a single JSON object with key "questions" whose value is an array of question objects. No markdown or extra text.`;

    const userPrompt = `Instruction: ${input.instruction}
Subtopics: ${input.subtopics.join(", ") || "general"}
Difficulty: ${difficultyLabel} (0-1 value: ${input.difficultyLevel}, use difficultyLevel 1-10 in each question)
Number of questions: ${input.numberOfQuestions}
UserId (set as madeById on each question): ${input.userId}

Generate exactly ${input.numberOfQuestions} questions. Use a mix of types: multiple-choice, true-false, and short-answer. Use proper symbols (× ÷ ≤ ≥ √ π etc.) in all text, not ASCII substitutes. Return JSON: { "questions": [ ... ] }.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("OpenAI quiz generation timed out");
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OpenAI response missing content");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenAI response is not valid JSON");
    }

    const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const rawQuestions = Array.isArray(obj.questions) ? obj.questions : Array.isArray(parsed) ? parsed : [];
    const questions = rawQuestions;
    const now = new Date().toISOString();

    return questions.slice(0, input.numberOfQuestions).map((q: Record<string, unknown>, i: number) => {
      const difficultyLevel = Math.min(10, Math.max(1, Math.round(Number(q.difficultyLevel) || input.difficultyLevel * 10)));
      const question: Question = {
        createdAt: (q.createdAt as string) ? new Date(q.createdAt as string) : new Date(now),
        title: String(q.title ?? `Question ${i + 1}`),
        content: String(q.content ?? ""),
        tags: Array.isArray(q.tags) ? (q.tags as string[]) : [],
        totalPotentialMarks: Math.max(1, Math.round(Number(q.totalPotentialMarks) || 5)),
        difficultyLevel,
        subTopics: input.subtopics.length ? input.subtopics : (Array.isArray(q.subTopics) ? q.subTopics as string[] : undefined),
        explanation: typeof q.explanation === "string" ? q.explanation : undefined,
        type: typeof q.type === "string" ? q.type : undefined,
        options: Array.isArray(q.options) ? (q.options as Question["options"]) : undefined,
        isTrue: typeof q.isTrue === "boolean" ? q.isTrue : undefined,
        shortAnswers: Array.isArray(q.shortAnswers) ? (q.shortAnswers as Question["shortAnswers"]) : undefined,
        madeById: input.userId || (typeof q.madeById === "string" ? q.madeById : undefined),
        userType: typeof q.userType === "string" ? (q.userType as Question["userType"]) : undefined,
      };
      if (q.description != null) question.description = String(q.description);
      return question;
    });
  }
}
