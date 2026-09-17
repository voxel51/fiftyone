import * as fos from "@fiftyone/state";
import { useSetReverbState } from "@fiftyone/reverb";
import { Operator, OperatorConfig } from "../operators";
import { ExecutionContext, SetFiltersHooks, SetFiltersParams } from "../ts";
import * as types from "../types";

export class SetFilters extends Operator {
  _builtIn = true;

  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_filters",
      label: "Set Filters",
      unlisted: true,
    });
  }

  async resolveInput() {
    const inputs = new types.Object();
    return new types.Property(inputs);
  }

  useHooks() {
    const setFilters = useSetReverbState(fos.filters);
    return { setFilters };
  }

  async execute(ctx: ExecutionContext<SetFiltersParams, SetFiltersHooks>) {
    const { hooks, params } = ctx;
    const { setFilters } = hooks;

    setFilters(params);
  }
}
