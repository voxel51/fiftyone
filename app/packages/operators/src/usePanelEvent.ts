import { usePanelId, usePanelStateByIdCallback } from "@fiftyone/spaces";
import { useNotification } from "@fiftyone/state";
import { useState, useEffect, useCallback } from "react";
import { useActivePanelEventsCount } from "./hooks";
import { executeOperator, OperatorResult } from "./operators";
import { usePromptOperatorInput } from "./state";
import { ExecutionCallback, ParamsType } from "./types-internal";
import { PanelEventError } from "@fiftyone/utilities";

type HandlerOptions = {
  params: { [name: string]: unknown };
  operator: string;
  prompt?: boolean;
  panelId: string;
  callback?: ExecutionCallback;
  currentPanelState?: any; // most current panel state
};

type PendingError = {
  message: string;
  error: any;
  operator: string;
} | null;

type TriggerEventFn = (panelId: string, options: HandlerOptions) => void;

/**
 * A hook that can be used to trigger an operator on a panel.
 *
 * @returns A function that can be used to trigger an operator on a panel.
 *
 * Example:
 *
 * ```ts
 * const panelId = usePanelId();
 * const triggerEvent = usePanelEvent();
 * triggerEvent(panelId, {
 *   operator: "@voxel51/plugin/operator#event",
 *   params: { param1: "value1" },
 * });
 * ```
 */
export default function usePanelEvent(): TriggerEventFn {
  const promptForOperator = usePromptOperatorInput();
  // notify is still used for missing operator
  const notify = useNotification();
  const { increment, decrement } = useActivePanelEventsCount("");
  const { setPendingError } = usePendingPanelEventError();

  return usePanelStateByIdCallback((panelId, panelState, args) =>
    handlePanelEvent(
      {
        notify,
        promptForOperator,
        increment,
        decrement,
        setPendingError,
      },
      panelId,
      panelState,
      args
    )
  );
}

export function handlePanelEvent(
  {
    notify,
    promptForOperator,
    increment,
    decrement,
    setPendingError,
  }: {
    notify: ReturnType<typeof useNotification>;
    promptForOperator: ReturnType<typeof usePromptOperatorInput>;
    increment: (panelId: string) => void;
    decrement: (panelId: string) => void;
    setPendingError: (err: PendingError) => void;
  },
  panelId: string,
  panelState: any,
  args: any[]
) {
  const options = args[0] as HandlerOptions;
  const { params, operator, prompt, currentPanelState } = options;

  if (!operator) {
    notify({
      msg: "No operator provided for panel event.",
      variant: "error",
    });
    return console.error("No operator provided for panel event.");
  }

  const actualParams = {
    ...params,
    panel_id: panelId,
    panel_state: currentPanelState ?? ((panelState as any)?.state || {}),
  };

  const eventCallback = (result: OperatorResult, opts) => {
    decrement(panelId);
    let errorMessage = "Failed to execute operation";

    // Determine the error message, handling cases where result.error or result.errorMessage might be Error objects
    if (result.errorMessage) {
      errorMessage =
        typeof result.errorMessage === "string"
          ? result.errorMessage
          : result.errorMessage instanceof Error
          ? result.errorMessage.message
          : String(result.errorMessage);
    } else if (result.error) {
      errorMessage =
        typeof result.error === "string"
          ? result.error
          : result.error instanceof Error
          ? result.error.message
          : String(result.error);
    }

    let suppressError = false;
    if (typeof options?.callback === "function") {
      // Only suppress error if callback explicitly returns false
      const cbResult = options.callback(result, opts);
      // @ts-expect-error: Intentional comparison to allow void | boolean return
      if (cbResult === false) {
        suppressError = true;
      }
    }
    if (result?.error && !suppressError) {
      // Set pending error to be thrown on next re-render
      setPendingError({
        message: errorMessage,
        error: result.error,
        operator,
      });
    }
  };

  const executeOptions: OperatorExecutorOptions = {
    callback: eventCallback,
    skipErrorNotification: true,
  };

  if (prompt) {
    promptForOperator(operator, actualParams, executeOptions);
  } else {
    increment(panelId);
    executeOperator(operator, actualParams, executeOptions);
  }
}

export function usePendingPanelEventError(): {
  setPendingError: (err: PendingError) => void;
  pendingError: PendingError;
} {
  const [pendingError, setPendingError] = useState<PendingError>(null);

  useEffect(() => {
    if (pendingError) {
      const { message, error, operator } = pendingError;
      setPendingError(null); // Clear the pending error
      const [operatorUri, eventName] = operator.split("#");
      throw new PanelEventError(
        message,
        error?.stack || error?.message || String(error),
        operatorUri,
        eventName
      );
    }
  }, [pendingError]);

  return { setPendingError, pendingError };
}

export function useTriggerPanelEvent() {
  const panelId = usePanelId();
  const handleEvent = usePanelEvent();

  const triggerEvent = useCallback(
    (
      event: string,
      params?: ParamsType,
      prompt?: boolean,
      callback?: ExecutionCallback
    ) => {
      handleEvent(panelId, {
        operator: event,
        params,
        prompt,
        callback,
        panelId,
      });
    },
    [handleEvent, panelId]
  );

  return triggerEvent;
}
