/**
 * The color-by control: a dropdown-styled trigger (matching Facet) that turns
 * into a filter box while open, over a single-select list of colorable fields.
 *
 * Local rather than VOODO's <Select>, which pins its dropdown to the measured
 * trigger width (9rem here) and so clips the long `imu_signals.*` paths this
 * list is mostly made of. Its trigger is also a combobox input that opens on
 * focus, which leaves the menu unopenable after a dismiss until focus moves
 * away; opening from an explicit click has no such state.
 */
import {
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMenuDismiss } from "./useMenuDismiss";
import "./panel.css";

export interface ColorByOption {
  id: string;
  data: { label: string };
}

export function ColorByMenu({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ColorByOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useMenuDismiss(open, rootRef, close);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((o) => o.data.label.toLowerCase().includes(q))
      : options;
  }, [options, query]);

  const selectedLabel = options.find((o) => o.id === value)?.data.label ?? "";

  return (
    <div
      className="emb-facet emb-colorby"
      data-open={open ? "true" : "false"}
      ref={rootRef}
    >
      {open ? (
        <div className="emb-facet-trigger" data-open="true">
          <input
            autoFocus
            type="text"
            className="emb-colorby-input"
            aria-label="Color by"
            placeholder={selectedLabel}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="emb-colorby-caret"
            aria-label="Close color-by menu"
            onClick={close}
          >
            <Icon
              name={IconName.CaretDown}
              size={Size.Sm}
              color={TextColor.Secondary}
            />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="emb-facet-trigger"
          data-open="false"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={false}
          aria-label="Color by"
          onClick={() => setOpen(true)}
        >
          <span className="emb-facet-trigger-label">
            <Text variant={TextVariant.Md} color={TextColor.Fg}>
              {selectedLabel}
            </Text>
          </span>
          <Icon
            name={IconName.CaretDown}
            size={Size.Sm}
            color={TextColor.Secondary}
          />
        </button>
      )}

      {open && (
        <div className="emb-facet-panel emb-colorby-panel" role="menu">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={o.id === value}
              className="emb-facet-row"
              onClick={() => {
                onChange(o.id);
                close();
              }}
            >
              <span className="emb-facet-check">
                {o.id === value && (
                  <Icon
                    name={IconName.Check}
                    size={Size.Sm}
                    color={TextColor.Fg}
                  />
                )}
              </span>
              <span className="emb-facet-row-label" title={o.data.label}>
                {o.data.label}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="emb-facet-section">
              <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
                No matching fields
              </Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
