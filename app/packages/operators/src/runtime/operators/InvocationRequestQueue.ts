import { QueueItemStatus } from "../../constants";
import { ExecutionCallback } from "../../types-internal";
import InvocationRequest from "./InvocationRequest";

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

type InvocationRequestQueueSubscriberType = (
  queue: InvocationRequestQueue
) => void;

export default class InvocationRequestQueue {
  constructor() {
    this._queue = [];
  }
  private _queue: QueueItem[];
  private _subscribers: InvocationRequestQueueSubscriberType[] = [];
  private _notifySubscribers() {
    for (const subscriber of this._subscribers) {
      this._notifySubscriber(subscriber);
    }
  }
  private _notifySubscriber(subscriber: InvocationRequestQueueSubscriberType) {
    subscriber(this);
  }
  subscribe(subscriber: InvocationRequestQueueSubscriberType) {
    this._subscribers.push(subscriber);
    if (this.hasPendingRequests()) {
      this._notifySubscriber(subscriber);
    }
  }
  unsubscribe(subscriber: InvocationRequestQueueSubscriberType) {
    const index = this._subscribers.indexOf(subscriber);
    if (index !== -1) {
      this._subscribers.splice(index, 1);
    }
  }
  get queue() {
    return this._queue;
  }
  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
  add(request: InvocationRequest, callback?: ExecutionCallback) {
    const item = new QueueItem(this.generateId(), request, callback);
    this._queue.push(item);
    this._notifySubscribers();
  }
  markAsExecuting(id: string) {
    const item = this._queue.find((d) => d.id === id);
    if (item) {
      item.status = QueueItemStatus.Executing;
      this._notifySubscribers();
    }
  }
  markAsCompleted(id: string) {
    const item = this._queue.find((d) => d.id === id);
    if (item) {
      item.status = QueueItemStatus.Completed;
      this._notifySubscribers();
    }
  }
  markAsFailed(id: string) {
    const item = this._queue.find((d) => d.id === id);
    if (item) {
      item.status = QueueItemStatus.Failed;
      this._notifySubscribers();
    }
  }
  hasPendingRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Pending);
  }
  hasExecutingRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Executing);
  }
  hasCompletedRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Completed);
  }
  hasFailedRequests() {
    return this._queue.some((d) => d.status === QueueItemStatus.Failed);
  }
  clean() {
    this._queue = this._queue.filter(
      (d) => d.status !== QueueItemStatus.Completed
    );
    this._notifySubscribers();
  }
  getNextPendingRequest() {
    const item = this._queue.find((d) => d.status === QueueItemStatus.Pending);
    return item ? item.request : null;
  }
  toJSON() {
    return this._queue.map((d) => ({
      id: d.id,
      status: d.status,
      request: d.request.toJSON(),
      callback: d.callback,
    }));
  }
}

let invocationRequestQueue: InvocationRequestQueue;

export function getInvocationRequestQueue() {
  if (!invocationRequestQueue) {
    invocationRequestQueue = new InvocationRequestQueue();
  }
  return invocationRequestQueue;
}
