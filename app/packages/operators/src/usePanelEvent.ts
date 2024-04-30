import { usePanelId } from "@fiftyone/spaces";
import { executeOperator } from "./operators";
import { usePromptOperatorInput } from "./state";
import { ExecutionCallback } from "./types-internal";

type HandlerOptions = {
  params: any;
  operator: string;
  prompt?: boolean;
  callback?: ExecutionCallback;
};

export default function usePanelEvent({
  panelId,
  panelState,
}: {
  panelId: string;
  panelState: any;
}) {
  const promptForOperator = usePromptOperatorInput();
  const handler = (options: HandlerOptions) => {
    const { params, operator, prompt } = options;
    const actualParams = {
      panel_id: panelId,
      panel_state: panelState,
      ...params,
    };
    if (prompt) {
      promptForOperator(operator, actualParams, { callback: options.callback });
    } else {
      executeOperator(operator, actualParams, options.callback);
    }
  };
  return handler;
}
