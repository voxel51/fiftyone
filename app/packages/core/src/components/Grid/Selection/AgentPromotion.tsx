import { Button, Text } from "@voxel51/voodo";
import { useState } from "react";
import AgentGlyph from "./AgentGlyph";
import AgentShowcase from "./AgentShowcase";
import SelectionTooltip from "./SelectionTooltip";

/**
 * The tray's agent entry where no assistant is installed. It opens a tour of
 * what the agent does; an installed assistant's operator placement replaces it.
 */
export default function AgentPromotion() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SelectionTooltip
        content={<Text variant="body-tertiary">Voxel51 Agent</Text>}
      >
        <Button
          size="sm"
          variant="borderless"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          style={{ minHeight: 32, gap: 6 }}
          data-cy="fiftyone-agent-promotion"
        >
          <AgentGlyph />
          Ask agent
        </Button>
      </SelectionTooltip>
      <AgentShowcase open={open} onClose={() => setOpen(false)} />
    </>
  );
}
