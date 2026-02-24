import { QuizRequestRepository } from "./infrastructure/repositories/quiz-request.repository";
import { QuizGenerationSqsClient } from "./infrastructure/sqs.client";
import { EntitlementClient } from "./infrastructure/entitlement.client";
import { RequestQuizUseCase } from "./app/usecases/request.quiz.usecase";
import { GetQuizRequestUseCase } from "./app/usecases/get.quiz.request.usecase";
import { ListQuizRequestsUseCase } from "./app/usecases/list.quiz.requests.usecase";
import { RequestQuizController } from "./app/controllers/request.quiz.controller";
import { GetQuizRequestController } from "./app/controllers/get.quiz.request.controller";
import { ListQuizRequestsController } from "./app/controllers/list.quiz.requests.controller";

export function bootstrap() {
  const tableName = process.env.QUIZ_REQUESTS_TABLE;
  if (!tableName) {
    throw new Error("QUIZ_REQUESTS_TABLE environment variable is not set");
  }
  const queueUrl = process.env.QUIZ_GENERATION_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("QUIZ_GENERATION_QUEUE_URL environment variable is not set");
  }
  const entitlementsTableName = process.env.ENTITLEMENTS_TABLE;
  if (!entitlementsTableName) {
    throw new Error("ENTITLEMENTS_TABLE environment variable is not set");
  }

  const repository = new QuizRequestRepository(tableName);
  const sqs = new QuizGenerationSqsClient(queueUrl);
  const entitlementClient = new EntitlementClient(entitlementsTableName);

  const requestQuizUseCase = new RequestQuizUseCase(repository, sqs);
  const getQuizRequestUseCase = new GetQuizRequestUseCase(repository);
  const listQuizRequestsUseCase = new ListQuizRequestsUseCase(repository);

  const requestQuizController = new RequestQuizController(requestQuizUseCase, entitlementClient);
  const getQuizRequestController = new GetQuizRequestController(getQuizRequestUseCase);
  const listQuizRequestsController = new ListQuizRequestsController(listQuizRequestsUseCase);

  return {
    requestQuizController,
    getQuizRequestController,
    listQuizRequestsController,
  };
}
