/**
 * The plot's settings cog: a dropdown (styled like the facet menu) holding
 * which palette continuous color-by values map through, plus whatever
 * sections the edition contributes around it (link-across-tiles and
 * find-similar knobs come from the extension — see extensions.ts).
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
import { rampGradient, RAMP_IDS, RAMPS, type RampId } from "./colors";
import { useMenuDismiss } from "./useMenuDismiss";
import "./panel.css";

export function SettingsMenu({
  rampId,
  onRampChange,
  renderBefore,
  renderAfter,
}: {
  rampId: RampId;
  onRampChange: (id: RampId) => void;
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
        <div className="emb-facet-panel emb-settings-panel" role="menu">
          {renderBefore?.(close)}

          {/* A ramp is a choice about where contrast sits, so the swatch is
              drawn from the same ramp the points get — picking blind is what
              makes a few extreme values read as one washed-out cloud */}
          <div className="emb-facet-section">
            <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
              CONTINUOUS COLOR PALETTE
            </Text>
          </div>
          {RAMP_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="emb-facet-row"
              onClick={() => id !== rampId && onRampChange(id)}
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
                  {RAMPS[id].label}
                </Text>
                <span
                  className="emb-settings-ramp"
                  style={{ background: rampGradient(id) }}
                />
                <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
                  {RAMPS[id].hint}
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
