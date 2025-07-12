import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { useNotification } from "@fiftyone/state";
import { useState, useEffect } from "react";
import { useActivePanelEventsCount } from "./hooks";
import { executeOperator } from "./operators";
import { usePromptOperatorInput } from "./state";
import { ExecutionCallback } from "./types-internal";
import { OperatorError, PanelEventError } from "@fiftyone/utilities";

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

export default function usePanelEvent() {
  const promptForOperator = usePromptOperatorInput();
  // notify is still used for missing operator
  const notify = useNotification();
  const { increment, decrement } = useActivePanelEventsCount("");
  const [pendingError, setPendingError] = useState<PendingError>(null);

  // Throw error on next re-render if there's a pending error
  useEffect(() => {
    if (pendingError) {
      const { message, error, operator } = pendingError;
      setPendingError(null); // Clear the pending error
      const [operatorUri, eventName] = operator.split("#");
      throw new PanelEventError(message, error, operatorUri, eventName);
    }
  }, [pendingError]);

  return usePanelStateByIdCallback((panelId, panelState, args) => {
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

    const eventCallback = (result, opts) => {
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

    if (prompt) {
      promptForOperator(operator, actualParams, { callback: eventCallback });
    } else {
      increment(panelId);
      executeOperator(operator, actualParams, { callback: eventCallback });
    }
  });
}
