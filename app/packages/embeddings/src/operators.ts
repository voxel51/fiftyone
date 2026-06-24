import { Operator, OperatorConfig, types } from "@fiftyone/operators";
import { ExecutionContext } from "@fiftyone/operators/src/operators";
import { Property } from "@fiftyone/operators/src/types";
import * as fos from "@fiftyone/state";
import { getBrainKeysFromDataset, useBrainResult } from "./useBrainResult";

export class OpenEmbeddingsPanel extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "open-embeddings-panel",
      label: "Open Embeddings Panel",
    });
  }
  useHooks() {
    const [, setBrainKey] = useBrainResult();
    return {
      setBrainKey,
    };
  }
  async resolveInput(ctx: ExecutionContext): Promise<Property> {
    const dataset = await ctx.state.snapshot.getPromise(fos.dataset);
    const brainKeys = getBrainKeysFromDataset(dataset);

    const inputs = new types.Object();
    inputs.defineProperty("brainKey", new types.Enum(brainKeys), {
      label: "Brain Key",
      description: "The brain key to use for the embeddings",
    });
    return new types.Property(inputs);
  }
  async execute(ctx) {
    const { brainKey } = ctx.params;
    ctx.hooks.setBrainKey(brainKey);
    ctx.trigger("open_panel", { panel: "Embeddings", isActive: true });
  }
}
