import type { RequestContext } from "../../handler/api-gateway/types";
import { ListQuizRequestsUseCase } from "../usecases/list.quiz.requests.usecase";

export class ListQuizRequestsController {
  constructor(private readonly useCase: ListQuizRequestsUseCase) {}

  handle = async (req: RequestContext) => {
    const user = req.user;
    if (!user?.id) {
      const err = new Error("Unauthorized");
      (err as Error & { name: string }).name = "AuthenticationError";
      throw err;
    }
    const pageNumber = Number(req.query?.page_number ?? 1);
    const pageSize = Number(req.query?.page_size ?? 20);
    const result = await this.useCase.execute({
      userId: user.id,
      pagination: { pageNumber, pageSize },
    });
    const total = result.total >= 0 ? result.total : 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    return {
      amount: total,
      data: result.items,
      pagination: {
        page_size: pageSize,
        page_number: pageNumber,
        total_pages: totalPages,
      },
    };
  };
}
