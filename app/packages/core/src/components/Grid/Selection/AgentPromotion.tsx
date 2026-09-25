import {
  Anchor,
  Button,
  Size,
  Text,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import AgentGlyph from "./AgentGlyph";

const AGENT_URL = "https://voxel51.com/voxel51-agent";

/** Replaced by an installed assistant's operator placement. */
export default function AgentPromotion() {
  return (
    <Tooltip
      anchor={Anchor.Top}
      content={
        <Text variant={TextVariant.Sm}>
          Automate repetitive data work - available in{" "}
          <a href={AGENT_URL} target="_blank" rel="noopener noreferrer">
            Voxel51
          </a>{" "}
          only
        </Text>
      }
    >
      <Button
        size={Size.Sm}
        variant={Variant.Borderless}
        aria-label="Voxel51 Agent"
        href={AGENT_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ minHeight: 32 }}
        data-cy="fiftyone-agent-promotion"
      >
        <AgentGlyph />
      </Button>
    </Tooltip>
  );
}
