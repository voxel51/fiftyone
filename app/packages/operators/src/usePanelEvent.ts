import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { executeOperator } from "./operators";
import { usePromptOperatorInput } from "./state";
import { ExecutionCallback } from "./types-internal";

type HandlerOptions = {
  params: any;
  operator: string;
  prompt?: boolean;
  panelId: string;
  callback?: ExecutionCallback;
};

export default function usePanelEvent() {
  const promptForOperator = usePromptOperatorInput();
  return usePanelStateByIdCallback((panelId, panelState, args) => {
    const options = args[0] as HandlerOptions;
    const { params, operator, prompt } = options;
    const actualParams = {
      ...params,
      panel_id: panelId,
      panel_state: panelState?.state || {},
    };
    if (prompt) {
      promptForOperator(operator, actualParams, { callback: options.callback });
    } else {
      executeOperator(operator, actualParams, { callback: options.callback });
    }
  });
}
