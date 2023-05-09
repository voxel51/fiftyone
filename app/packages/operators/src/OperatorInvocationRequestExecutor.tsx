import { useEffect } from "react";
import {
  useInvocationRequestExecutor,
  useInvocationRequestQueue,
} from "./state";
import { executeStartupOperators } from "./operators";

let called = false;
async function onMount() {
  if (called) return;
  called = true;
  await executeStartupOperators();
}

export default function OperatorInvocationRequestExecutor() {
  const { requests, onSuccess, onError } = useInvocationRequestQueue();

  useEffect(() => {
    onMount();
  }, [onMount]);

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
    executor.execute(queueItem.request.params);
  }, []);

  return null;
}
