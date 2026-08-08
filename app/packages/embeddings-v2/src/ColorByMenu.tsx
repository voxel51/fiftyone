/**
 * The color-by control: a dropdown-styled trigger (matching Facet) that turns
 * into a filter box while open, over a single-select combobox list of
 * colorable fields.
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
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
  const [activeIndex, setActiveIndex] = useState(0);
  // Snapshot of the trigger's own (closed) rendered width, applied while
  // open so swapping the label for the filter input never resizes the
  // shell under the pointer — forcing it to the panel's max width instead
  // would jump short-labeled controls open wider than they were closed.
  const [openWidthPx, setOpenWidthPx] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setOpenWidthPx(null);
  }, []);
  useMenuDismiss(open, rootRef, close);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((o) => o.data.label.toLowerCase().includes(q))
      : options;
  }, [options, query]);

  // The highlighted option resets whenever the open list's contents change,
  // so a stale index from a wider (or narrower) filter never points past
  // the end of the new list
  useEffect(() => {
    setActiveIndex(0);
  }, [open, query]);

  const selectedLabel = options.find((o) => o.id === value)?.data.label ?? "";
  const activeOption = filtered[activeIndex] ?? null;
  const activeOptionId = activeOption
    ? `${listId}-${activeOption.id}`
    : undefined;

  const commit = (id: string) => {
    onChange(id);
    close();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeOption) commit(activeOption.id);
    }
  };

  return (
    <div
      className="emb-facet emb-colorby"
      data-open={open ? "true" : "false"}
      ref={rootRef}
      style={open && openWidthPx !== null ? { width: openWidthPx } : undefined}
    >
      {open ? (
        <div className="emb-facet-trigger" data-open="true">
          <input
            autoFocus
            type="text"
            className="emb-colorby-input"
            role="combobox"
            aria-label="Color by"
            aria-expanded={true}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            placeholder={selectedLabel}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
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
          aria-haspopup="listbox"
          aria-expanded={false}
          aria-label="Color by"
          onClick={() => {
            setOpenWidthPx(
              rootRef.current?.getBoundingClientRect().width ?? null,
            );
            setOpen(true);
          }}
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
        <div
          className="emb-facet-panel emb-colorby-panel"
          role="listbox"
          id={listId}
        >
          {filtered.map((o, index) => (
            <button
              key={o.id}
              id={`${listId}-${o.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-selected={o.id === value}
              className="emb-facet-row"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(o.id)}
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
