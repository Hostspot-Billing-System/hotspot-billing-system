export class MikroTikRuntimeError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function toHttpError(err) {
  if (err instanceof MikroTikRuntimeError) {
    return {
      httpStatus: err.httpStatus,
      body: { success: false, error: { code: err.code, message: err.message } },
    };
  }

  return {
    httpStatus: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}
