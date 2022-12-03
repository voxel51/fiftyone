export interface GQLError {
  extensions: {
    stack: string[];
  };
  message: string;
  paths: string[];
}

export class AppError extends Error {
  readonly name: string;

  constructor({ name }: { name: string }, message?: string) {
    super(message);
    this.name = name;
  }

  get data() {
    return {
      name: this.name,
    };
  }
}

export class GraphQLError extends AppError {
  readonly errors: GQLError[] = [];
  readonly variables?: object;
  constructor({
    errors,
    variables,
  }: {
    errors: GQLError[];
    variables?: object;
  }) {
    super({ name: "GraphQL API Error" });
    this.errors = errors;
    this.variables = variables;
  }

  get data() {
    return {
      errors: this.errors,
      variables: this.variables,
      ...super.data,
    };
  }
}

export class NetworkError extends AppError {
  readonly code: number;
  readonly statusText: string;
  readonly bodyResponse: string;
  readonly payload: object;
  readonly route: string;
  readonly requestHeaders: HeadersInit;
  readonly responseHeaders: Headers;

  constructor(
    {
      code,
      route,
      statusText,
      payload,
      bodyResponse,
      requestHeaders,
      responseHeaders,
    }: {
      code: number;
      bodyResponse: string;
      statusText: string;
      route: string;
      payload: object;
      requestHeaders: HeadersInit;
      responseHeaders: Headers;
    },
    message: string
  ) {
    super({ name: "Network Error" }, message);
    this.code = code;
    this.bodyResponse = bodyResponse;
    this.route = route;
    this.statusText = statusText;
    this.payload = payload;
    this.requestHeaders = requestHeaders;
    this.responseHeaders = responseHeaders;
  }

  get data() {
    return {
      code: this.code,
      route: this.route,
      payload: this.payload,
      requestHeaders: this.requestHeaders,
      responseHeaders: { ...this.responseHeaders },
      ...super.data,
    };
  }
}

export class NotFoundError extends AppError {
  readonly path: string;

  constructor({ path }: { path: string }) {
    super({ name: "Not Found Error" }, `404: ${path} not found`);
    this.path = path;
  }

  get data() {
    return {
      path: this.path,
      ...super.data,
    };
  }
}

export class ServerError extends NetworkError {
  readonly stack?: string;

  constructor(
    {
      code,
      bodyResponse,
      statusText,
      payload,
      requestHeaders,
      responseHeaders,
      route,
      stack,
    }: {
      code: number;
      bodyResponse: string;
      route: string;
      payload: object;
      requestHeaders: HeadersInit;
      responseHeaders: Headers;
      statusText: string;
      stack?: string;
    },
    message: string
  ) {
    super(
      {
        code,
        statusText,
        bodyResponse,
        route,
        payload,
        requestHeaders,
        responseHeaders,
      },
      message
    );
    this.stack = stack;
  }

  get data() {
    return {
      stack: this.stack,
      ...super.data,
    };
  }
}
