import type { RequestContext } from "../../handler/api-gateway/types";
import { RequestQuizUseCase } from "../usecases/request.quiz.usecase";
import { EntitlementClient } from "../../infrastructure/entitlement.client";

function parseBody(body: unknown): {
  instruction: string;
  subtopics: string[];
  difficultyLevel: number;
  numberOfQuestions: number;
} {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const instruction = typeof b.instruction === "string" ? b.instruction : "";
  if (!instruction.trim()) {
    throw new Error("instruction is required");
  }
  const subtopics = Array.isArray(b.subtopics)
    ? (b.subtopics as string[]).filter((s) => typeof s === "string")
    : [];
  const difficultyLevel = Number(b.difficultyLevel);
  const numberOfQuestions = Number(b.numberOfQuestions) || 5;
  if (Number.isNaN(difficultyLevel) || difficultyLevel < 0 || difficultyLevel > 1) {
    throw new Error("difficultyLevel must be a number between 0 and 1");
  }
  return {
    instruction: instruction.trim(),
    subtopics,
    difficultyLevel: Math.min(1, Math.max(0, difficultyLevel)),
    numberOfQuestions: Math.max(1, Math.min(50, Math.round(numberOfQuestions))),
  };
}

export class RequestQuizController {
  constructor(
    private readonly useCase: RequestQuizUseCase,
    private readonly entitlementClient: EntitlementClient
  ) {}

  handle = async (req: RequestContext): Promise<{ id: string; status: string }> => {
    const user = req.user;
    if (!user?.id) {
      const err = new Error("Unauthorized");
      (err as Error & { name: string }).name = "AuthenticationError";
      throw err;
    }
    const check = await this.entitlementClient.checkQuizGenerationAccess(user.id);
    if (!check.hasAccess || !check.canConsumeOne) {
      const err = new Error(
        check.hasAccess
          ? "No remaining quiz generation usage. Limit reached."
          : "No access to quiz generation or usage limit reached."
      );
      (err as Error & { name: string }).name = "UsageExhaustedError";
      throw err;
    }
    const { instruction, subtopics, difficultyLevel, numberOfQuestions } = parseBody(req.body);
    return this.useCase.execute({
      userId: user.id,
      instruction,
      subtopics,
      difficultyLevel,
      numberOfQuestions,
    });
  };
}
