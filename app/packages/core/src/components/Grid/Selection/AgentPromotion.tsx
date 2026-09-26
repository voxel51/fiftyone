import {
  Anchor,
  Button,
  Size,
  Text,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { useState } from "react";
import AgentGlyph from "./AgentGlyph";
import AgentShowcase from "./AgentShowcase";

/**
 * The tray's agent entry where no assistant is installed. It opens a tour of
 * what the agent does; an installed assistant's operator placement replaces it.
 */
export default function AgentPromotion() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip
        anchor={Anchor.Top}
        content={<Text variant={TextVariant.Sm}>Voxel51 Agent</Text>}
      >
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          aria-label="Voxel51 Agent"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          style={{ minHeight: 32 }}
          data-cy="fiftyone-agent-promotion"
        >
          <AgentGlyph />
        </Button>
      </Tooltip>
      <AgentShowcase open={open} onClose={() => setOpen(false)} />
    </>
  );
}
