export class NotFoundError extends Error {
  constructor(path: string) {
    super(path);
    this.message = `404: ${path} not found`;
    this.name = "404: Not Found Error";
  }
}

export class ServerError extends Error {
  constructor(stack: string) {
    super();
    this.message = "Server Error";
    this.name = "500: Server Error";
    this.stack = stack;
  }
}
