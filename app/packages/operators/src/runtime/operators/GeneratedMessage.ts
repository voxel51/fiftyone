import useExecutionResults from "../hooks/useExecutionResults";
import ExecutionResult from "./ExecutionResult";
import InvocationRequest from "./InvocationRequest";

// Enum for message types
enum MessageType {
  SUCCESS = "success",
  ERROR = "error",
}

/**
 * Represents a generated message during operator execution.
 */
export default class GeneratedMessage {
  public type: MessageType;
  public cls: typeof InvocationRequest | typeof useExecutionResults;
  public body: any;

  constructor(
    type: MessageType,
    cls: typeof InvocationRequest | typeof ExecutionResult,
    body: any
  ) {
    this.type = type;
    this.cls = cls;
    this.body = body;
  }

  /**
   * Creates a GeneratedMessage from a JSON object.
   * @param json - The JSON object representing a generated message.
   * @returns {GeneratedMessage} - The generated message.
   */
  static fromJSON(json: {
    cls: string;
    type: string;
    body: any;
  }): GeneratedMessage {
    let cls = null;

    // Determine the class based on the JSON's "cls" field
    switch (json.cls) {
      case "InvocationRequest":
        cls = InvocationRequest;
        break;
      case "ExecutionResult":
        cls = ExecutionResult;
        break;
      default:
        throw new Error(`Unknown message class: ${json.cls}`);
    }

    // Determine the message type
    const type =
      json.type === "SUCCESS" ? MessageType.SUCCESS : MessageType.ERROR;

    return new GeneratedMessage(type, cls, json.body);
  }
}
