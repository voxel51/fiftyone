import InvocationRequest from "./InvocationRequest";
import { getInvocationRequestQueue } from "./InvocationRequestQueue";

/**
 * Executor class to manage and queue invocation requests and log execution steps.
 */
export default class Executor {
  public requests: InvocationRequest[];
  public logs: string[];

  constructor(requests: InvocationRequest[] = [], logs: string[] = []) {
    this.requests = requests;
    this.logs = logs;
  }

  /**
   * Queues all the requests in the executor.
   */
  queueRequests(): void {
    if (this.requests.length === 0) {
      return;
    }

    const queue = getInvocationRequestQueue();
    for (const request of this.requests) {
      queue.add(request);
    }
  }

  /**
   * Adds a request to the executor.
   *
   * @param operatorURI - The URI of the operator to be triggered.
   * @param params - Parameters for the operator execution.
   */
  trigger(operatorURI: string, params: object = {}): void {
    this.requests.push(new InvocationRequest(operatorURI, params));
  }

  /**
   * Logs a message during the execution.
   *
   * @param message - The message to be logged.
   */
  log(message: string): void {
    this.logs.push(message);
  }

  /**
   * Converts the executor instance to JSON.
   *
   * @returns JSON representation of the executor.
   */
  toJSON(): { requests: any[]; logs: string[] } {
    return {
      requests: this.requests.map((request) => request.toJSON()),
      logs: this.logs,
    };
  }

  /**
   * Creates an Executor instance from JSON.
   *
   * @param json - JSON object representing the executor.
   * @returns Executor instance.
   */
  static fromJSON(json: { requests: any[]; logs: string[] }): Executor {
    const requests = json.requests.map((request) =>
      InvocationRequest.fromJSON(request)
    );
    return new Executor(requests, json.logs);
  }

  /**
   * Checks if there are any pending requests in the executor.
   *
   * @returns Boolean indicating if there are pending requests.
   */
  hasPendingRequests(): boolean {
    return this.requests.length > 0;
  }

  /**
   * Clears the requests and logs in the executor.
   */
  clear(): void {
    this.requests = [];
    this.logs = [];
  }
}
