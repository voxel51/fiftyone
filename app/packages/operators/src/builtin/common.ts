import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { Operator, OperatorConfig } from "../operators";
import {
  ExecutionContext,
  ListBrainRunsHooks,
  ListBrainRunsParams,
} from "../ts";
import * as types from "../types";

export class ListBrainRuns extends Operator {
  _builtIn = true;

  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "list_brain_runs",
      label: "List brain runs",
      unlisted: true,
    });
  }

  async resolveInput() {
    const inputs = new types.Object();

    inputs.enum("type", ["visualization", "similarity"]);

    return new types.Property(inputs);
  }

  useHooks() {
    const dataset = useRecoilValue(fos.dataset);

    return { dataset };
  }

  async execute(
    ctx: ExecutionContext<ListBrainRunsParams, ListBrainRunsHooks>
  ) {
    const { hooks, params } = ctx;
    const { dataset } = hooks;
    const { type } = params;

    const { brainMethods } = dataset;

    let result = brainMethods;

    if (type === "visualization") {
      result = brainMethods.filter((brainMethod) =>
        brainMethod.config.cls.includes("fiftyone.brain.visualization")
      );
    } else if (type === "similarity") {
      result = brainMethods.filter((brainMethod) => {
        const { cls, type } = brainMethod.config;
        return type == "similarity" || cls.toLowerCase().includes("similarity");
      });
    }

    console.log(">>> result", result);

    return result;
  }
}
