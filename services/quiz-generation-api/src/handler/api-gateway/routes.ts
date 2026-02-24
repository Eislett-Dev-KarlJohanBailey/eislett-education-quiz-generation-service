import { bootstrap } from "../../bootstrap";
import type { RequestContext } from "./types";

const { requestQuizController, getQuizRequestController, listQuizRequestsController } = bootstrap();

export const routes: Record<string, (req: RequestContext) => Promise<unknown>> = {
  "POST /quiz-generation": requestQuizController.handle,
  "GET /quiz-generation": listQuizRequestsController.handle,
  "GET /quiz-generation/{id}": getQuizRequestController.handle,
};
