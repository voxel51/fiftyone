import {
  Operator,
  OperatorConfig,
  registerOperator,
} from "@fiftyone/operators";
import { useSetRecoilState } from "recoil";
import { panelOneStateAtom } from "./recoil";

export class SetPanelOneState extends Operator {
  get config() {
    return new OperatorConfig({
      name: "set_panel_one_state",
      label: "Set Panel One State",
      unlisted: true,
    });
  }

  useHooks() {
    const setPanelOneState = useSetRecoilState(panelOneStateAtom);
    return { setPanelOneState };
  }

  async execute(ctx) {
    ctx.hooks.setPanelOneState(ctx.params.run_data);
  }
}

registerOperator(SetPanelOneState, "@voxel51/operators");
