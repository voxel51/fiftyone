/**
 * Represents the result of an operator's execution.
 */
export default class ExecutionResult {
  public result: object;

  constructor(result: object) {
    this.result = result;
  }

  /**
   * Creates an ExecutionResult from a JSON object.
   * @param json - The JSON object representing an execution result.
   * @returns {ExecutionResult} - The execution result instance.
   */
  static fromJSON(json: { result: object }): ExecutionResult {
    return new ExecutionResult(json.result);
  }

  /**
   * Converts the ExecutionResult to a JSON object.
   * @returns {object} - The JSON representation of the execution result.
   */
  toJSON(): object {
    return {
      result: this.result,
    };
  }
}
