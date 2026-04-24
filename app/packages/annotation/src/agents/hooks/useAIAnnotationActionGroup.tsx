import { ToolbarActionGroup } from "@fiftyone/components";
import { usePointSelection } from "./usePointSelection";
import { useEffect, useMemo } from "react";
import { Icon, IconName } from "@voxel51/voodo";
import { useAgentSelector } from "./useAgentSelector";
import { useAnnotationAgent } from "./useAnnotationAgent";
import { InferenceCapability } from "../types";

/**
 * Hook which returns a {@link ToolbarActionGroup} encapsulating AI annotation
 * tooling.
 */
export const useAIAnnotationActionGroup = (): ToolbarActionGroup => {
  const pointSelection = usePointSelection();
  const { inferenceCapabilities } = useAnnotationAgent(
    useAgentSelector()?.activeAgent?.agent
  );

  // Deactivate all tools on unmount
  useEffect(() => {
    return () => {
      pointSelection.deactivate();
    };
  }, []);

  return useMemo(
    () => ({
      id: "ai-annotation-tools",
      label: "AI Annotation",
      isHidden: false,
      actions: [
        {
          icon: <Icon name={IconName.AI} />,
          id: "ai-annotation-point-selection",
          isActive: pointSelection.isActive,
          isDisabled: ![
            InferenceCapability.POSITIVE_POINT,
            InferenceCapability.NEGATIVE_POINT,
          ].some((capability) => inferenceCapabilities.includes(capability)),
          isVisible: true,
          label: "AI Point Selection",
          onClick: () => {
            if (pointSelection.isActive) {
              pointSelection.deactivate();
            } else {
              pointSelection.activate();
            }
          },
          shortcut: "A",
          tooltip:
            "Select positive (inclusive) and negative (exclusive) points for segmentation",
        },
      ],
    }),
    [inferenceCapabilities, pointSelection]
  );
};
