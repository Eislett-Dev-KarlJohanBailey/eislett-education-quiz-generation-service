import type { RequestContext } from "../../handler/api-gateway/types";
import { GetQuizRequestUseCase } from "../usecases/get.quiz.request.usecase";

export class GetQuizRequestController {
  constructor(private readonly useCase: GetQuizRequestUseCase) {}

  handle = async (req: RequestContext) => {
    const user = req.user;
    if (!user?.id) {
      const err = new Error("Unauthorized");
      (err as Error & { name: string }).name = "AuthenticationError";
      throw err;
    }
    const id = req.pathParams?.id;
    if (!id) {
      throw new Error("id is required in path");
    }
    const quiz = await this.useCase.execute({ userId: user.id, id });
    if (!quiz) {
      const err = new Error("Quiz request not found");
      (err as Error & { name: string }).name = "NotFoundError";
      throw err;
    }
    return quiz;
  };
}
