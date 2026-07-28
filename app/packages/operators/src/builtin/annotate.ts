import { useAnnotationController } from "@fiftyone/annotation";
import * as fos from "@fiftyone/state";
import { Operator, OperatorConfig } from "../operators";
import * as types from "../types";

import type { ExecutionContext } from "../ts";

type AnnotationController = ReturnType<typeof useAnnotationController>;

export type AnnotateHooks = {
  setExpanded: ReturnType<typeof fos.useSetExpandedSample>;
  enterAnnotationMode: AnnotationController["enterAnnotationMode"];
};

export type AnnotateParams = {
  id?: string;
  group_id?: string;
  field_path?: string;
  label_id?: string;
};

export class Annotate extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "annotate",
      label: "Annotate",
      unlisted: true,
    });
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();

    inputs.str("id", { label: "Sample ID" });
    inputs.str("group_id", { label: "Group ID" });
    inputs.str("field_path", { label: "Field Path" });
    inputs.str("label_id", { label: "Label ID" });

    return new types.Property(inputs);
  }
  useHooks(): AnnotateHooks {
    const { enterAnnotationMode } = useAnnotationController();
    const setExpanded = fos.useSetExpandedSample();

    return { setExpanded, enterAnnotationMode };
  }
  async execute(ctx: ExecutionContext<AnnotateParams, AnnotateHooks>) {
    const { hooks, params } = ctx;
    const { setExpanded, enterAnnotationMode } = hooks;
    const { id, group_id, field_path, label_id } = params;

    setExpanded({ id, groupId: group_id });
    enterAnnotationMode(field_path, label_id);
  }
}
