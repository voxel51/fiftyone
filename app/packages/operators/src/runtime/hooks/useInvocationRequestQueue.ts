import { useEffect, useRef, useState, useCallback } from "react";
import { InvocationRequestQueue, InvocationRequest } from "../operators";

type UseInvocationRequestQueueReturn = {
  requests: InvocationRequest[];
  onSuccess: (id: string) => void;
  onError: (id: string) => void;
};

/**
 * useInvocationRequestQueue
 *
 * A hook to manage the queue of invocation requests, providing methods to handle success and error events.
 *
 * @returns {UseInvocationRequestQueueReturn} - An object containing requests, success, and error handling functions.
 */
export default function useInvocationRequestQueue(): UseInvocationRequestQueueReturn {
  const ref = useRef<InvocationRequestQueue>();
  const [requests, setRequests] = useState<InvocationRequest[]>([]);

  useEffect(() => {
    const queue = (ref.current = new InvocationRequestQueue());
    const subscriber = (updatedQueue: InvocationRequestQueue) => {
      setRequests(updatedQueue.toJSON());
    };
    queue.subscribe(subscriber);

    return () => {
      queue.unsubscribe(subscriber);
    };
  }, []);

  const onSuccess = useCallback((id: string) => {
    const queue = ref.current;
    if (queue) {
      queue.markAsCompleted(id);
    }
  }, []);

  const onError = useCallback((id: string) => {
    const queue = ref.current;
    if (queue) {
      queue.markAsFailed(id);
    }
  }, []);

  return {
    requests,
    onSuccess,
    onError,
  };
}
