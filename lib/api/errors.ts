// Real (non-enterprise) shared API error helper — this file just never
// existed upstream, it isn't a gated feature.

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable_entity"
  | "rate_limit_exceeded"
  | "internal_server_error";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable_entity: 422,
  rate_limit_exceeded: 429,
  internal_server_error: 500,
};

export class PapermarkApiError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "PapermarkApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
