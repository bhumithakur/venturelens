/** Base class for errors that should be shown to API clients. */
export class AppError extends Error {
  constructor(status, code, message, details, headers) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers; // optional response headers, e.g. { "Retry-After": "30" }
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super(404, "NOT_FOUND", message);
  }
}

export class NotImplementedError extends AppError {
  constructor(message) {
    super(501, "NOT_IMPLEMENTED", message);
  }
}

/** The client disconnected; there is nobody to send a response to. */
export class ClientClosedError extends AppError {
  constructor() {
    super(499, "CLIENT_CLOSED_REQUEST", "Client closed the request");
  }
}
