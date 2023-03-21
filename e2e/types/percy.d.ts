// typing percy-client so that it's easier to work with
// reference: https://github.com/percy/cli/blob/master/packages/client/src/client.js

declare module "@percy/client" {
  export interface PercyOptions {
    token?: string;
    apiUrl: string;
  }

  export default class PercyClient {
    constructor(options?: PercyOptions);
  }
}
