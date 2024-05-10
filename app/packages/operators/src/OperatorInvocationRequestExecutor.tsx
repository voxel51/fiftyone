import { useEffect } from "react";
import {
  useInvocationRequestExecutor,
  useInvocationRequestQueue,
} from "./state";

export default function OperatorInvocationRequestExecutor() {
  const { requests, onSuccess, onError } = useInvocationRequestQueue();

  return (
    <>
      {requests.map((queueItem) => (
        <RequestExecutor
          key={queueItem.id}
          queueItem={queueItem}
          onSuccess={onSuccess}
          onError={onError}
        />
      ))}
    </>
  );
}

function RequestExecutor({ queueItem, onSuccess, onError }) {
  const executor = useInvocationRequestExecutor({
    queueItem,
    onSuccess,
    onError,
  });

  useEffect(() => {
    executor.execute(queueItem.request.params, {
      callback: queueItem.callback,
      ...(queueItem?.request?.options || {}),
    });
  }, [
    executor,
    queueItem.callback,
    queueItem.request?.options,
    queueItem.request.params,
  ]);

  return null;
}
