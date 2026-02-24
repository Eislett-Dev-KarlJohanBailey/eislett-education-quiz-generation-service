export interface RequestContext {
  method: string;
  path: string;
  pathParams: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers?: Record<string, string>;
  user?: {
    id: string;
    role?: string;
  };
}
