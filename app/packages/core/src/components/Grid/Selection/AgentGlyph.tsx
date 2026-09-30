import { cssVar } from "@voxel51/voodo";
import { useId } from "react";

/**
 * The static voxel mark of the agent. It is drawn at its own size rather than
 * through an icon slot, which would squeeze it into a 14px box.
 */
export default function AgentGlyph({ size = 18 }: { size?: number }) {
  const glow = `${useId()}-glow`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ display: "block", flex: "none", overflow: "visible" }}
    >
      <defs>
        <filter id={glow}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g fill={cssVar.color.brand.primary}>
        <polygon points="16,4 28,10 16,16 4,10" fillOpacity="0.45" />
        <polygon points="16,4 4,10 4,22 16,28" fillOpacity="0.28" />
        <polygon points="16,4 28,10 28,22 16,28" fillOpacity="0.16" />
      </g>
      <g
        stroke={cssVar.color.brand.primary}
        strokeWidth="1"
        strokeLinecap="round"
      >
        <path d="M16,4 L4,10 M16,4 L28,10" strokeOpacity="0.9" />
        <path d="M4,10 L4,22 M28,10 L28,22" strokeOpacity="0.7" />
        <path d="M4,22 L16,28 M28,22 L16,28" strokeOpacity="0.6" />
        <path
          d="M4,10 L16,16 L28,10 M16,16 L16,28"
          strokeOpacity="0.5"
          strokeWidth="0.8"
        />
      </g>
      <circle
        cx="16"
        cy="4"
        r="1.8"
        fill={cssVar.color.brand.primary}
        filter={`url(#${glow})`}
      />
    </svg>
  );
}
