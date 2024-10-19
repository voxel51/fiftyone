import { CallbackInterface } from "recoil";
import { OperatorResult } from "./OperatorResult";
import { Panel, RawContext } from "./types";
import { InvocationRequest } from "./InvocationRequest";

export default class ExecutionContext {
  public state: CallbackInterface;
  public params: object;
  public _currentContext: RawContext;
  public hooks: object;
  public executor: OperatorResult;

  constructor(
    params: object = {},
    currentContext: RawContext,
    hooks: object = {},
    executor: OperatorResult = null
  ) {
    this.params = params;
    this._currentContext = currentContext;
    this.hooks = hooks;
    this.executor = executor;
    this.state = currentContext.state;
  }

  trigger(operatorURI: string, params: object = {}) {
    if (!this.executor) {
      throw new Error("Cannot trigger operator outside of execution context");
    }
    this.executor.requests.push(new InvocationRequest(operatorURI, params));
  }

  log(message: string) {
    if (!this.executor) {
      throw new Error("Cannot log outside of execution context");
    }
    this.executor.log(message);
  }
}
