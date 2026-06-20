import * as fos from "@fiftyone/state";
import { useSetAtom } from "jotai";
import { Operator, OperatorConfig } from "../operators";
import * as types from "../types";

import type { ExecutionContext } from "../ts";

export type AnnotateHooks = {
  setExpanded: ReturnType<typeof fos.useSetExpandedSample>;
  activateAnnotateMode: () => void;
  setPendingTarget: (target: fos.PendingAnnotationTarget | null) => void;
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
    const { activateAnnotateMode } = fos.useModalModeController();
    const setExpanded = fos.useSetExpandedSample();
    const setPendingTarget = useSetAtom(fos.pendingAnnotationTargetAtom);

    return { setExpanded, activateAnnotateMode, setPendingTarget };
  }
  async execute(ctx: ExecutionContext<AnnotateParams, AnnotateHooks>) {
    const { hooks, params } = ctx;
    const { setExpanded, activateAnnotateMode, setPendingTarget } = hooks;
    const { id, group_id, field_path, label_id } = params;

    // Publish the deep-link target for the modal to consume so the operator
    // needn't import the heavy in-modal annotation controller at startup.
    if (field_path || label_id) {
      setPendingTarget({ path: field_path, labelId: label_id });
    }
    activateAnnotateMode();
    setExpanded({ id, groupId: group_id });
  }
}
