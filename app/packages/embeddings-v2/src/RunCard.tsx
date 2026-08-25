/**
 * Generic card for a run-like entity: icon well, title, small keyed
 * badge, status pill, dot-separated metadata line, and a trailing
 * actions cluster whose clicks do not activate the card. Colors
 * resolve through design-system token enums via CSS custom properties
 * (see panel.css). Kept intentionally generic so it can graduate to
 * @voxel51/voodo.
 */
import {
  BackgroundColor,
  BorderColor,
  BrandColor,
  getColorCssVar,
  Icon,
  IconColor,
  IconName,
  Pill,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { type CSSProperties, type ReactNode } from "react";
import "./panel.css";

export interface RunCardStatus {
  label: string;
  /** Any content color; icon-tier tokens give the softer status tones */
  color: TextColor | IconColor;
}

export interface RunCardProps {
  icon?: IconName;
  title: string;
  /** Small keyed badge next to the title, e.g. "2D" */
  badge?: string;
  /** Brand-tinted badge treatment (e.g. capability tiers) */
  badgeAccent?: boolean;
  /** Status pill in the trailing cluster */
  status?: RunCardStatus;
  /** Dot-separated metadata line under the title */
  meta?: ReactNode[];
  /** Trailing action cluster; clicks do not bubble to the card */
  actions?: ReactNode;
  onClick?: () => void;
}

const TOKEN_VARS = {
  "--emb-card-bg": `var(${getColorCssVar(BackgroundColor.Card2)})`,
  "--emb-card-hover": `var(${getColorCssVar(BackgroundColor.CardElevated)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
  "--emb-border-strong": `var(${getColorCssVar(BorderColor.Strong)})`,
  "--emb-brand": `var(${getColorCssVar(BrandColor.Primary)})`,
  "--emb-text-secondary": `var(${getColorCssVar(TextColor.Secondary)})`,
} as CSSProperties;

export function RunCard({
  icon,
  title,
  badge,
  badgeAccent = false,
  status,
  meta,
  actions,
  onClick,
}: RunCardProps) {
  const interactive = Boolean(onClick);
  return (
    <div
      className="emb-run-card"
      data-interactive={interactive ? "true" : "false"}
      style={TOKEN_VARS}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="emb-run-card-row">
        <div className="emb-run-card-lead">
          {icon && (
            <div className="emb-run-card-iconwell">
              <Icon name={icon} size={Size.Sm} color={TextColor.Secondary} />
            </div>
          )}
          <span className="emb-run-card-title">
            <Text variant={TextVariant.Lg} color={TextColor.Foreground}>
              {title}
            </Text>
          </span>
          {badge && (
            <span
              className="emb-run-card-badge"
              data-accent={badgeAccent ? "true" : "false"}
            >
              {badge}
            </span>
          )}
        </div>
        <div
          className="emb-run-card-trail"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {status && (
            <Pill
              size={Size.Xs}
              isStatus
              backgroundColor={BackgroundColor.CardElevated}
              // Pill's prop is under-typed: the class map underneath
              // (textColorMap) is Record<Color, string>, icon tokens
              // included — the cast widens types to match the runtime
              color={status.color as TextColor}
            >
              {status.label}
            </Pill>
          )}
          {actions}
        </div>
      </div>
      {meta && meta.length > 0 && (
        <div className="emb-run-card-meta">
          {meta.map((item, index) => (
            // The dot travels with its segment: a narrow card wraps
            // between segments, never inside one
            <span className="emb-run-card-meta-item" key={index}>
              {index > 0 && <span className="emb-run-card-meta-dot" />}
              <Text variant={TextVariant.Md} color={TextColor.Tertiary}>
                {item}
              </Text>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
