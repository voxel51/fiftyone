import { Operator, types } from "@fiftyone/operators";
import { ExecutionContext } from "@fiftyone/operators/src/operators";
import { Property } from "@fiftyone/operators/src/types";
import * as fos from "@fiftyone/state";
import { getBrainKeysFromDataset, useBrainResult } from "./useBrainResult";

export class OpenEmbeddingsPanel extends Operator {
  constructor() {
    super("open-embeddings-panel", "Open Embeddings Panel");
  }
  useHooks(ctx: ExecutionContext) {
    const [brainKey, setBrainKey] = useBrainResult();
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
  }
  async execute(ctx) {
    const { brainKey } = ctx.params;
    ctx.hooks.setBrainKey(brainKey);
    ctx.trigger("open_panel", { panel: "Embeddings", isActive: true });
  }
}
