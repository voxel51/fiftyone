import {
  Anchor,
  Button,
  cssVar,
  Size,
  Text,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";

const AGENT_URL = "https://voxel51.com/voxel51-agent";

/** The static voxel glyph used by the agent's tray action. */
function AgentGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <g fill={cssVar.color.brand.primary}>
        <circle cx="16" cy="4" r="1.5" />
        <polygon points="16,4 28,10 16,16 4,10" fillOpacity="0.35" />
        <polygon points="16,4 4,10 4,22 16,28" fillOpacity="0.2" />
        <polygon points="16,4 28,10 28,22 16,28" fillOpacity="0.12" />
      </g>
      <g
        stroke={cssVar.color.brand.primary}
        strokeWidth="0.8"
        strokeLinecap="round"
      >
        <path d="M16,4 L4,10 M16,4 L28,10" strokeOpacity="0.6" />
        <path d="M4,10 L4,22 M28,10 L28,22" strokeOpacity="0.4" />
        <path d="M4,22 L16,28 M28,22 L16,28" strokeOpacity="0.35" />
        <path
          d="M4,10 L16,16 L28,10 M16,16 L16,28"
          strokeOpacity="0.3"
          strokeWidth="0.6"
        />
      </g>
    </svg>
  );
}

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
        leadingIcon={AgentGlyph}
        aria-label="Voxel51 Agent"
        href={AGENT_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ minHeight: 32 }}
        data-cy="fiftyone-agent-promotion"
      />
    </Tooltip>
  );
}
