import { InvocationRequest } from "./InvocationRequest";
import { QueueItemStatus } from "../../constants";
import { ExecutionCallback } from "../../types-internal";

class QueueItem {
  constructor(
    public id: string,
    public request: InvocationRequest,
    public callback?: ExecutionCallback
  ) {
    this.status = QueueItemStatus.Pending;
  }

  public status: QueueItemStatus;
}

export default class InvocationRequestQueue {
  private _queue: QueueItem[] = [];
  private _subscribers: InvocationRequestQueueSubscriberType[] = [];

  add(request: InvocationRequest, callback?: ExecutionCallback) {
    const item = new QueueItem(
      Math.random().toString(36).substr(2, 9),
      request,
      callback
    );
    this._queue.push(item);
    this._notifySubscribers();
  }

  private _notifySubscribers() {
    this._subscribers.forEach((subscriber) => subscriber(this));
  }
}

let invocationRequestQueue: InvocationRequestQueue;
export function getInvocationRequestQueue() {
  if (!invocationRequestQueue) {
    invocationRequestQueue = new InvocationRequestQueue();
  }
  return invocationRequestQueue;
}
