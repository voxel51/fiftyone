import { useEffect, useMemo } from "react";
import {
  useInvocationRequestExecutor,
  useInvocationRequestQueue,
} from "./state";
import { QueueItemStatus } from "./constants";

export default function OperatorInvocationRequestExecutor() {
  const { requests, onSuccess, onError } = useInvocationRequestQueue();
  const pendingRequests = useMemo(() => {
    return requests.filter(
      (queueItem) => queueItem.status === QueueItemStatus.Pending
    );
  }, [requests]);

  return (
    <>
      {pendingRequests.map((queueItem) => (
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
  }, []);

  return null;
}
