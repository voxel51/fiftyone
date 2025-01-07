import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { useNotification } from "@fiftyone/state";
import { useActivePanelEventsCount } from "./hooks";
import { executeOperator } from "./operators";
import { usePromptOperatorInput } from "./state";
import { ExecutionCallback } from "./types-internal";

type HandlerOptions = {
  params: { [name: string]: unknown };
  operator: string;
  prompt?: boolean;
  panelId: string;
  callback?: ExecutionCallback;
  onCancel?: () => void;
  currentPanelState?: any; // most current panel state
};

export default function usePanelEvent() {
  const promptForOperator = usePromptOperatorInput();
  const notify = useNotification();
  const { increment, decrement } = useActivePanelEventsCount("");
  return usePanelStateByIdCallback((panelId, panelState, args) => {
    const options = args[0] as HandlerOptions;
    const { params, operator, prompt, currentPanelState, onCancel } = options;

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
      panel_state: currentPanelState ?? (panelState?.state || {}),
    };

    const eventCallback = (result, opts) => {
      decrement(panelId);
      const msg =
        result.errorMessage || result.error || "Failed to execute operation";
      const computedMsg = `${msg} (operation: ${operator})`;
      if (result?.error) {
        notify({ msg: computedMsg, variant: "error" });
        console.error(result?.error);
      }
      options?.callback?.(result, opts);
    };

    if (prompt) {
      promptForOperator(operator, actualParams, {
        callback: eventCallback,
        onCancel,
      });
    } else {
      increment(panelId);
      executeOperator(operator, actualParams, { callback: eventCallback });
    }
  });
}
