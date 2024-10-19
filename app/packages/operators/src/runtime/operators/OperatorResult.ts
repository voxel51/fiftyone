import Executor from "./Executor";
import Operator from "./Operator";

function isObjWithContent(obj: any): boolean {
  return obj !== null && typeof obj === "object" && Object.keys(obj).length > 0;
}

export default class OperatorResult {
  constructor(
    public operator: Operator,
    public result: object = {},
    public executor: Executor = null,
    public error: string = "",
    public delegated: boolean = false,
    public errorMessage: string = null
  ) {}

  hasOutputContent(): boolean {
    return (
      !this.delegated &&
      (isObjWithContent(this.result) || isObjWithContent(this.error))
    );
  }

  toJSON() {
    return {
      result: this.result,
      error: this.error,
      executor: this.executor,
    };
  }
}
