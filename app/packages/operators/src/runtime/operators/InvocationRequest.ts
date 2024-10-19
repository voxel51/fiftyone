import { OperatorExecutorOptions } from "../../types-internal";

type RawInvocationRequest = {
  operator_uri?: string;
  operator_name?: string;
  params: object;
  options: object;
};

export default class InvocationRequest {
  constructor(
    public operatorURI: string,
    public params: unknown = {},
    public options?: OperatorExecutorOptions
  ) {}

  static fromJSON(json: RawInvocationRequest): InvocationRequest {
    return new InvocationRequest(
      json.operator_uri || json.operator_name,
      json.params,
      json.options
    );
  }

  toJSON() {
    return {
      operatorURI: this.operatorURI,
      params: this.params,
      options: this.options,
    };
  }
}
