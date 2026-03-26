import {
  DetectionAnnotationLabel,
  useCurrentDatasetName,
  useCurrentSampleId,
} from "@fiftyone/state";
import {
  AgentTaskType,
  AnnotationAgent,
  AnnotationContext,
  InferenceCapability,
  InferenceResult,
  InferenceResultProxy,
  ROI,
} from "../types";
import { useCallback, useEffect, useMemo } from "react";
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { atom, useAtom } from "jotai";
import { useToolsContext } from "./useToolsContext";
import { useActiveTask } from "./useActiveTask";
import { useActiveCapabilities } from "./useActiveCapabilities";

/**
 * Converts an `[x, y, w, h]` bounding box to a four-corner {@link ROI}
 * polygon, represented as counter-clockwise points from the top-left corner.
 */
const bboxToRoi = (
  bbox: [x: number, y: number, width: number, height: number]
): ROI => [
  [bbox[0], bbox[1]], // top-left
  [bbox[0], bbox[1] + bbox[3]], // bottom-left
  [bbox[0] + bbox[2], bbox[1] + bbox[3]], // bottom-right
  [bbox[0] + bbox[2], bbox[1]], // top-right
];

const supportedTaskAtom = atom<AgentTaskType[]>([]);

/**
 * Convenience wrapper around an {@link AnnotationAgent} with pre-bound
 * annotation state.
 */
export interface ResolvedAgent<T> {
  /**
   * Runs inference with the current annotation context.
   * Skips inference and returns `null` for invalid contexts.
   */
  infer(): Promise<InferenceResult<T> | null>;

  /** List of tasks supported by the agent. */
  supportedTasks: AgentTaskType[];

  /**
   * List of capabilities supported for the active task type.
   * See {@link useActiveTask}.
   */
  inferenceCapabilities: InferenceCapability[];
}

/**
 * Hook which provides a {@link ResolvedAgent} for the given
 * {@link AnnotationAgent}.
 *
 * This exposes a more convenient interface for interacting with
 * {@link AnnotationAgent}s by providing closures around relevant annotation
 * state.
 *
 * @param agent Agent to wrap
 */
export const useAnnotationAgent = <T extends InferenceResultProxy>(
  agent?: AnnotationAgent<T>
): ResolvedAgent<T> | null => {
  const [supportedTasks, setSupportedTasks] = useAtom(supportedTaskAtom);

  const annotationContext = useAgentContext();
  const { activeTask } = useActiveTask();
  const { capabilities } = useActiveCapabilities(agent, activeTask);

  const infer = useCallback(async () => {
    if (!agent || !annotationContext) return null;

    return agent.infer(annotationContext);
  }, [agent, annotationContext]);

  useEffect(() => {
    // eagerly clear to maintain consistent UX, even when agent becomes null
    setSupportedTasks([]);

    if (!agent) return;

    let cancelled = false;
    agent.listSupportedTasks().then((res) => {
      if (!cancelled) setSupportedTasks(res);
    });

    return () => {
      cancelled = true;
    };
  }, [agent, setSupportedTasks]);

  const resolvedAgent = useMemo(
    () => ({ infer, inferenceCapabilities: capabilities, supportedTasks }),
    [capabilities, infer, supportedTasks]
  );

  return agent ? resolvedAgent : null;
};

/**
 * Hook which provides the current {@link AnnotationContext}.
 *
 * When a label is selected, the label's properties (such as its bounding box
 * and label) will be included in the context.
 *
 * When no label is selected, all inputs are derived from the current
 * {@link ToolsContext}.
 *
 * In all cases, this context includes the current {@link SampleDescriptor}.
 */
const useAgentContext = (): AnnotationContext | null => {
  const datasetId = useCurrentDatasetName();
  const sampleId = useCurrentSampleId();
  const { selectedLabel } = useAnnotationContext();
  const toolsContext = useToolsContext();

  return useMemo(() => {
    const labelOverride =
      selectedLabel && "bounding_box" in selectedLabel.data
        ? {
            taskType: AgentTaskType.SEGMENT,
            textPrompt: selectedLabel.data.label,
            regionsOfInterest: [
              bboxToRoi(
                (selectedLabel as DetectionAnnotationLabel).data.bounding_box
              ),
            ],
          }
        : {};

    const taskType =
      "taskType" in labelOverride
        ? labelOverride.taskType
        : toolsContext.taskType;

    // No valid context until a task is selected
    if (!taskType) return null;

    return {
      ...toolsContext,
      ...labelOverride,
      taskType,
      sampleDescriptor: {
        datasetId,
        sampleId,
      },
    };
  }, [datasetId, sampleId, selectedLabel, toolsContext]);
};
