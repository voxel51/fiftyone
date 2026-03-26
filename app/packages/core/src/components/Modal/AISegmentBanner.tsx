/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Top-of-canvas banner for AI-assisted segmentation.
 * Shows a text prompt input and instruction text.
 */

import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { useAISegment } from "./Sidebar/Annotate/Edit/useAISegment";

const BannerContainer = styled.div`
  position: absolute;
  top: 50px;
  /* Center over the canvas area (left of the sidebar, roughly 70% of viewport) */
  left: 35%;
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
  const [draft, setDraft] = useState(prompt);

  // Sync draft when prompt changes externally (e.g. on reset/exit)
  useEffect(() => {
    setDraft(prompt);
  }, [prompt]);

  const commitPrompt = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed !== prompt) {
      setPrompt(trimmed);
    }
  }, [draft, prompt, setPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitPrompt();
        (e.target as HTMLInputElement).blur();
      }
      // Stop keyboard events from reaching the canvas (e.g. Delete key)
      e.stopPropagation();
    },
    [commitPrompt]
  );

  if (!active) return null;

  return (
    <BannerContainer
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <PromptInput
        placeholder="Describe the object to segment..."
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitPrompt}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      {prompt.length > 0 && (
        <InstructionText>Click on an object to segment it</InstructionText>
      )}
    </BannerContainer>
  );
};
