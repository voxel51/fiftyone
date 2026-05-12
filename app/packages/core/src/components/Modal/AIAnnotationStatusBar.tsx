import { useInferenceStatus } from "@fiftyone/annotation/src/agents";
import styled from "styled-components";
import { useIsAIAnnotationModeActive } from "./Sidebar/Annotate/Edit/useAIAnnotationMode";

const POSITIVE_COLOR = "hsl(140, 60%, 50%)";
const NEGATIVE_COLOR = "hsl(0, 70%, 55%)";

const Container = styled.div`
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1502;
  pointer-events: none;
  user-select: none;

  display: flex;
  align-items: center;
  gap: 12px;

  padding: 4px 12px;
  border-radius: 6px;

  font-size: 12px;
  line-height: 1;
  color: ${({ theme }) => theme.text.secondary};
`;

const Marker = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &::before {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${(p) => p.$color};
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
  }
`;

const Separator = styled.span`
  color: ${({ theme }) => theme.text.tertiary};
`;

const Inferring = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: ${({ theme }) => theme.text.primary};
  font-weight: 500;
`;

const Spinner = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid ${({ theme }) => theme.text.tertiary};
  border-top-color: ${({ theme }) => theme.text.primary};
  animation: ai-status-spin 0.9s linear infinite;

  @keyframes ai-status-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

/**
 * Floating status / guidance display shown at the top of the modal sample
 * pane while AI-assisted annotation mode is active.
 *
 * - Idle: shows positive/negative prompt guidance.
 * - Inferring: shows a spinner with "Inferring..." while the agent is running.
 */
export const AIAnnotationStatusBar = () => {
  const isActive = useIsAIAnnotationModeActive();
  const status = useInferenceStatus();

  if (!isActive) return null;

  return (
    <Container data-cy="ai-annotation-status-bar">
      {status === "inferring" ? (
        <Inferring>
          <Spinner />
          Inferring...
        </Inferring>
      ) : (
        <>
          <Marker $color={POSITIVE_COLOR}>Positive prompt</Marker>
          <Marker $color={NEGATIVE_COLOR}>Negative prompt</Marker>
          <Separator>·</Separator>
          <span>Shift = Invert</span>
          <Separator>·</Separator>
          <span>Click marker to remove</span>
        </>
      )}
    </Container>
  );
};

export default AIAnnotationStatusBar;
