/**
 * Generic inline callout: icon + title + description, an optional
 * actions row, and an optional leading aside (media, animation).
 * Colors resolve through design-system token enums via CSS custom
 * properties (see panel.css). Kept intentionally generic so it can
 * graduate to @voxel51/voodo.
 */
import {
  BackgroundColor,
  BorderColor,
  BrandColor,
  getColorCssVar,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { CSSProperties, ReactNode } from "react";
import "./panel.css";

export interface CalloutProps {
  icon?: IconName;
  title: string;
  description?: string;
  /** Action buttons row, rendered under the copy */
  actions?: ReactNode;
  /** Decorative leading region (media, animation) */
  aside?: ReactNode;
}

const TOKEN_VARS = {
  "--emb-brand": `var(${getColorCssVar(BrandColor.Primary)})`,
  "--emb-card-bg": `var(${getColorCssVar(BackgroundColor.Card1)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
} as CSSProperties;

export function Callout({
  icon,
  title,
  description,
  actions,
  aside,
}: CalloutProps) {
  return (
    <div
      className="emb-callout"
      data-aside={aside ? "true" : "false"}
      style={TOKEN_VARS}
    >
      {aside}
      <div className="emb-callout-copy">
        <div className="emb-callout-heading">
          {icon && (
            <Icon name={icon} size={Size.Sm} color={BrandColor.Primary} />
          )}
          <Text variant={TextVariant.Md} color={TextColor.Fg}>
            {title}
          </Text>
        </div>
        {description && (
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            {description}
          </Text>
        )}
        {actions && <div className="emb-callout-actions">{actions}</div>}
      </div>
    </div>
  );
}
