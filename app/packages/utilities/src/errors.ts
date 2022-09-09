export interface GQLError {
  extensions: {
    stack: string[];
  };
}

export class GraphQLError extends Error {
  readonly errors: GQLError[] = [];
  constructor(errors: GQLError[]) {
    super();
    this.name = "GraphQL Error";
    this.errors = errors;
  }
}

export class NotFoundError extends Error {
  constructor(path: string) {
    super(path);
    this.message = `404: ${path} not found`;
    this.name = "Not Found Error";
  }
}

export class ServerError extends Error {
  constructor(stack: string) {
    super();
    this.message = "Server Error";
    this.name = "Server Error";
    this.stack = stack;
  }
}
