export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details: unknown = null) => new ApiError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') => new ApiError(401, code, message);
export const forbidden = (message = 'You do not have permission to do that') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, details: unknown = null) => new ApiError(409, code, message, details);
export const validationError = (details: unknown, message = 'Validation failed') => new ApiError(422, 'VALIDATION_ERROR', message, details);
