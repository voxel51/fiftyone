import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { executeOperator } from "./operators";
import { usePromptOperatorInput } from "./state";
import { ExecutionCallback } from "./types-internal";
import { useNotification } from "@fiftyone/state";

type HandlerOptions = {
  params: any;
  operator: string;
  prompt?: boolean;
  panelId: string;
  callback?: ExecutionCallback;
};

export default function usePanelEvent() {
  const promptForOperator = usePromptOperatorInput();
  const notify = useNotification();
  return usePanelStateByIdCallback((panelId, panelState, args) => {
    const options = args[0] as HandlerOptions;
    const { params, operator, prompt } = options;
    const actualParams = {
      ...params,
      panel_id: panelId,
      panel_state: panelState?.state || {},
    };

    const eventCallback = (result) => {
      const msg =
        result.errorMessage || result.error || "Failed to execute operation";
      const computedMsg = `${msg} (operation: ${operator})`;
      if (result?.error) {
        notify({ msg: computedMsg, variant: "error" });
        console.error(result?.error);
      }
      options?.callback?.(result);
    };

    if (prompt) {
      promptForOperator(operator, actualParams, { callback: eventCallback });
    } else {
      executeOperator(operator, actualParams, { callback: eventCallback });
    }
  });
}
