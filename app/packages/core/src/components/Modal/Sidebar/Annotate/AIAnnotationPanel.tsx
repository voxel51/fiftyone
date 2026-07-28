import { AgentSelect } from "@fiftyone/annotation/src/agents/AgentSelect";
import { useAgentSelector } from "@fiftyone/annotation/src/agents/hooks";
import type React from "react";
import styled from "styled-components";
import { useIsAIAnnotationModeActive } from "./Edit/useAIAnnotationMode";

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 1rem 1rem;
`;

/**
 * Sidebar controls for AI-assisted annotation, shown while AI segmentation
 * mode is active: the agent picker.
 *
 * Point selection is toggled from the SegmentationToolbar's AI tool (selecting
 * it enters AI mode). This panel only hosts the agent picker, which has no
 * toolbar-action equivalent.
 */
const AIAnnotationPanel: React.FC = () => {
  const isAIMode = useIsAIAnnotationModeActive();
  const agentSelector = useAgentSelector();

  if (!isAIMode) return null;

  return (
    <Panel>
      <AgentSelect
        value={agentSelector.activeAgent}
        onChange={(a) => agentSelector.setActiveAgent(a)}
        showEnterpriseUpsell
      />
    </Panel>
  );
};

export default AIAnnotationPanel;
