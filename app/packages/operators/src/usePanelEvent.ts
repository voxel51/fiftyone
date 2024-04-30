import {
  usePanelId,
  usePanelState,
  usePanelStateByIdCallback,
} from "@fiftyone/spaces";
import { executeOperator } from "./operators";
import { usePromptOperatorInput } from "./state";
import { ExecutionCallback } from "./types-internal";
import { useRecoilCallback } from "recoil";

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
    console.log("...............");
    console.log("panelId", panelId);
    console.log("panelState", panelState);
    const options = args[0] as HandlerOptions;
    const { params, operator, prompt } = options;
    const actualParams = {
      ...params,
      panel_id: panelId,
      panel_state: panelState?.state || {},
    };
    // console.log(options, actualParams)
    if (prompt) {
      promptForOperator(operator, actualParams, { callback: options.callback });
    } else {
      executeOperator(operator, actualParams, options.callback);
    }
  }, true); // local true since all custom panels are local
}
