export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerError";
  }

  bodyResponse = {
    kind: "Server Error",
    stack: "Mocked server error stack trace",
  };
}

export function getFetchFunction() {
  return async (method: string, endpoint: string, body: object) => {
    // Simulating a fetch response with the method, endpoint, and body
    return {
      result: { mockResult: "success" },
      error: null,
      executor: null,
      delegated: false,
      error_message: null,
    };
  };
}

// Mock for isNullish
export function isNullish(value: any): boolean {
  return value === null || value === undefined;
}
