/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Top-of-canvas banner for AI-assisted segmentation.
 * Shows a text prompt input and instruction text.
 */

import React from "react";
import styled from "styled-components";
import { useAISegment } from "./Sidebar/Annotate/Edit/useAISegment";

const BannerContainer = styled.div`
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10002;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
`;

const PromptInput = styled.input`
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  padding: 8px 14px;
  min-width: 300px;
  outline: none;
  backdrop-filter: blur(8px);

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  &:focus {
    border-color: rgba(255, 255, 255, 0.4);
  }
`;

const InstructionText = styled.div`
  background: rgba(0, 0, 0, 0.65);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  padding: 4px 10px;
  backdrop-filter: blur(8px);
`;

export const AISegmentBanner: React.FC = () => {
  const { active, prompt, setPrompt } = useAISegment();

  if (!active) return null;

  return (
    <BannerContainer>
      <PromptInput
        placeholder="Describe the object to segment..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        autoFocus
      />
      {prompt.length > 0 && (
        <InstructionText>Click on an object to segment it</InstructionText>
      )}
    </BannerContainer>
  );
};
