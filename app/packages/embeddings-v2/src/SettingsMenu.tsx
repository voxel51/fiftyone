/**
 * The plot's settings cog: a dropdown (styled like the facet menu) holding
 * which palette continuous color-by values map through, plus whatever
 * sections the edition contributes around it (link-across-tiles and
 * find-similar knobs come from the extension — see extensions.ts).
 *
 * A pick hands the ramp up, and the host writes its stops into the App color
 * scheme on the same atom the color settings modal edits — a continuous
 * color-by field's entry when one is active, the scheme's defaultColorscale
 * otherwise — so the two UIs can never disagree (see useRunPlotData).
 *
 * Sections are render props receiving `close`, because only a section knows
 * which of its choices should dismiss the menu.
 */
import {
  Button,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  CONTINUOUS_RAMP_IDS,
  CONTINUOUS_RAMPS,
  rampGradient,
  type ContinuousRampId,
} from "@fiftyone/utilities";
import { useMenuDismiss } from "./useMenuDismiss";
import "./panel.css";

export function SettingsMenu({
  rampId,
  colorscaleTarget,
  onRampChange,
  renderBefore,
  renderAfter,
}: {
  /** The ramp the scheme's colorscale state matches; null when the target
   * has a custom/named scale, or nothing set. */
  rampId?: ContinuousRampId | null;
  /** The field a pick applies to; null edits the scheme's default. */
  colorscaleTarget?: string | null;
  onRampChange?: (id: ContinuousRampId) => void;
  /** Sections rendered above the ramp section */
  renderBefore?: (close: () => void) => ReactNode;
  /** Sections rendered below the ramp section */
  renderAfter?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(open, rootRef, close);

  return (
    <div className="emb-facet" ref={rootRef}>
      <Button
        variant={Variant.Icon}
        size={Size.Md}
        leadingIcon={IconName.Settings}
        aria-label="Plot settings"
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="emb-facet-panel emb-settings-panel">
          {renderBefore?.(close)}

          {/* A ramp is a choice about where contrast sits, so the swatch is
              drawn from the same ramp the points get — picking blind is what
              makes a few extreme values read as one washed-out cloud */}
          <div className="emb-facet-section">
            <div>
              <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
                CONTINUOUS COLOR PALETTE
              </Text>
            </div>
            <div>
              <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
                {colorscaleTarget ?? "Color scheme default"}
              </Text>
            </div>
          </div>
          {CONTINUOUS_RAMP_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="emb-facet-row"
              aria-pressed={rampId === id}
              onClick={() => id !== rampId && onRampChange?.(id)}
            >
              <span className="emb-facet-check">
                {rampId === id && (
                  <Icon
                    name={IconName.Check}
                    size={Size.Sm}
                    color={TextColor.Fg}
                  />
                )}
              </span>
              <span className="emb-settings-option">
                <Text variant={TextVariant.Md} color={TextColor.Fg}>
                  {CONTINUOUS_RAMPS[id].label}
                </Text>
                <span
                  className="emb-settings-ramp"
                  style={{ background: rampGradient(id) }}
                />
                <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
                  {CONTINUOUS_RAMPS[id].hint}
                </Text>
              </span>
            </button>
          ))}

          {renderAfter?.(close)}
        </div>
      )}
    </div>
  );
}
