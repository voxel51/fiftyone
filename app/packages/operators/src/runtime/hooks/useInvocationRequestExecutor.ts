import { useCallback } from "react";
import { OperatorResult } from "../operators";
import useOperatorExecutor from "./useOperatorExecutor";

type UseInvocationRequestExecutorParams = {
  queueItem: {
    id: string;
    request: {
      operatorURI: string;
      params: object;
    };
  };
  onSuccess: (id: string) => void;
  onError: (id: string) => void;
};

type UseInvocationRequestExecutorReturn = ReturnType<
  typeof useOperatorExecutor
>;

/**
 * useInvocationRequestExecutor
 *
 * A hook to manage the execution of a request from the invocation request queue.
 *
 * @param params - An object containing the queue item, onSuccess, and onError handlers.
 * @returns {UseInvocationRequestExecutorReturn} - The operator executor instance.
 */
export default function useInvocationRequestExecutor({
  queueItem,
  onSuccess,
  onError,
}: UseInvocationRequestExecutorParams): UseInvocationRequestExecutorReturn {
  const { operatorURI, params } = queueItem.request;

  const executor = useOperatorExecutor(operatorURI, {
    onSuccess: () => {
      onSuccess(queueItem.id);
    },
    onError: () => {
      onError(queueItem.id);
    },
  });

  return executor;
}
