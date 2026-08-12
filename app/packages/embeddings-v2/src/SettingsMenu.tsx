/**
 * The plot's settings cog: a dropdown (styled like the facet menu) holding
 * the sections the edition contributes (link-across-tiles and find-similar
 * knobs come from the extension — see extensions.ts). Renders nothing when
 * no edition contributes a section.
 *
 * Sections are render props receiving `close`, because only a section knows
 * which of its choices should dismiss the menu.
 */
import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useMenuDismiss } from "./useMenuDismiss";
import "./panel.css";

export function SettingsMenu({
  renderBefore,
  renderAfter,
}: {
  /** Sections rendered at the top of the menu */
  renderBefore?: (close: () => void) => ReactNode;
  /** Sections rendered at the bottom of the menu */
  renderAfter?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(open, rootRef, close);

  if (!renderBefore && !renderAfter) return null;

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
          {renderAfter?.(close)}
        </div>
      )}
    </div>
  );
}
