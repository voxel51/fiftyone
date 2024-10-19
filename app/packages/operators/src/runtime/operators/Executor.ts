import { InvocationRequest } from "./InvocationRequest";
import { getInvocationRequestQueue } from "./InvocationRequestQueue";

export default class Executor {
  constructor(public requests: InvocationRequest[], public logs: string[]) {
    this.requests = requests || [];
    this.logs = logs || [];
  }

  queueRequests() {
    const queue = getInvocationRequestQueue();
    this.requests.forEach((request) => queue.add(request));
  }

  log(message: string) {
    this.logs.push(message);
  }
}
