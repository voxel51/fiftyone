import { useState, useEffect, useCallback } from "react";
import { getInvocationRequestQueue, InvocationRequest } from "../operators";

type ExecutorQueueRequest = {
  id: string;
  status: string;
  request: InvocationRequest;
};

type UseExecutorQueueReturn = {
  requests: ExecutorQueueRequest[];
  onSuccess: (id: string) => void;
  onError: (id: string) => void;
};

/**
 * useExecutorQueue
 *
 * Manages a queue of operator execution requests.
 *
 * @returns An object with request handling functions.
 */
export default function useExecutorQueue(): UseExecutorQueueReturn {
  const [requests, setRequests] = useState<ExecutorQueueRequest[]>([]);

  useEffect(() => {
    const queue = getInvocationRequestQueue();

    const updateRequests = (updatedQueue: any) => {
      setRequests(updatedQueue.toJSON());
    };

    queue.subscribe(updateRequests);

    return () => {
      queue.unsubscribe(updateRequests);
    };
  }, []);

  const onSuccess = useCallback((id: string) => {
    const queue = getInvocationRequestQueue();
    queue.markAsCompleted(id);
  }, []);

  const onError = useCallback((id: string) => {
    const queue = getInvocationRequestQueue();
    queue.markAsFailed(id);
  }, []);

  return {
    requests,
    onSuccess,
    onError,
  };
}
