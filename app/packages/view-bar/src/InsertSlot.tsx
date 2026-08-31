/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The slot between two stages: a "+" that becomes a typeahead over the stages
 * this dataset can take.
 *
 * Declared at module scope rather than inside the bar, so it keeps its own
 * typeahead state across the bar's renders instead of remounting — a
 * component created during render is a new type every time, and React
 * discards everything the old one held.
 */

import { AnchoredListbox, useAnchorRect } from "@fiftyone/components";
import {
  Anchor,
  Clickable,
  Icon,
  IconName,
  Input,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import React from "react";

import { StageDescription } from "./description";
import { NO_BROWSER_SUGGESTIONS } from "./params";

/** Wider than the trigger, so each stage's description reads as a sentence. */
const LIST_WIDTH = 320;

export interface InsertSlotProps {
  /** Where in the chain a stage inserted here lands. */
  index: number;
  /** The stages this dataset can take, already narrowed by media type. */
  names: readonly string[];
  /** What a stage does, shown inline under its name in the list. */
  describe: (name: string) => string | undefined;
  onInsert: (cls: string, index: number) => void;
  /**
   * Render the typeahead input persistently instead of a "+" that opens it —
   * the empty bar's CTA is the real selector, not a button that becomes one.
   * The stage list drops down while the input is focused.
   */
  pinned?: boolean;
}

export const InsertSlot: React.FC<InsertSlotProps> = ({
  index,
  names,
  describe,
  onInsert,
  pinned,
}) => {
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // Highlighted stage, driven by the arrow keys. Clamped on read rather than
  // reset by an effect, so it stays valid as the filtered set changes.
  const [highlight, setHighlight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Pinned, the input is always there and focus gates the list; unpinned,
  // opening autofocuses the input so open alone is the gate
  const isOpen = Boolean(pinned) || open;
  const listVisible = pinned ? focused : open;
  const rect = useAnchorRect(containerRef, listVisible);

  React.useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names;
    return names.filter((n) => n.toLowerCase().includes(q));
  }, [query, names]);

  const active = Math.min(highlight, Math.max(0, filtered.length - 1));

  const insert = (cls: string) => {
    onInsert(cls, index);
    setOpen(false);
    setQuery("");
  };

  if (!isOpen) {
    const trigger = (
      <Clickable
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Insert stage"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: 24,
          width: 24,
          borderRadius: 12,
          color: "var(--fo-palette-text-secondary)",
          flexShrink: 0,
        }}
      >
        <Icon name={IconName.Add} size={Size.Sm} />
      </Clickable>
    );

    // Anchored to the right, not below: a centered tooltip on the leftmost
    // slot extends past the bar's left edge, and voodo's Tooltip does not
    // slide itself back into view. Beside the "+" it grows away from the
    // edge instead.
    return (
      <Tooltip anchor={Anchor.Right} content="Insert stage">
        {trigger}
      </Tooltip>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: 200,
        flexShrink: 0,
        background: "var(--fo-palette-background-level2)",
        borderRadius: 4,
        border: "1px solid var(--fo-palette-text-placeholder)",
      }}
    >
      <Input
        size={Size.Sm}
        value={query}
        placeholder="Add stage…"
        // A pinned slot renders at page load — it must not steal the keyboard
        autoFocus={!pinned}
        {...NO_BROWSER_SUGGESTIONS}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            if (pinned) {
              // The input stays; dropping focus is what dismisses the list
              (e.target as HTMLElement).blur();
            }
          } else if (e.key === "ArrowDown") {
            // Arrow keys must not also move the text cursor
            e.preventDefault();
            setHighlight(Math.min(active + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight(Math.max(active - 1, 0));
          } else if (e.key === "Enter" && filtered[active]) {
            insert(filtered[active]);
          }
        }}
        role="combobox"
        aria-expanded={listVisible}
        aria-activedescendant={
          filtered[active] ? `view-bar-stage-${active}` : undefined
        }
        style={{ background: "transparent", border: "none" }}
      />
      <AnchoredListbox
        rect={rect}
        options={filtered}
        activeIndex={active}
        onPick={insert}
        onHighlight={setHighlight}
        optionId={(i) => `view-bar-stage-${i}`}
        // The visible content concatenates name + description; the
        // option's announced name is just the stage name
        optionAriaLabel={(name) => name}
        // Wider than the trigger so descriptions read as sentences
        width={LIST_WIDTH}
        maxHeight={360}
        renderOption={(name) => {
          const description = describe(name);
          return (
            <>
              <div
                style={{
                  color: "var(--fo-palette-text-primary)",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </div>
              {description && (
                // What the stage does, without leaving the list — its
                // docstring's opening sentence, served with the schema
                <div
                  style={{
                    color: "var(--fo-palette-text-secondary)",
                    fontSize: "0.85em",
                    lineHeight: 1.35,
                    marginTop: 2,
                  }}
                >
                  <StageDescription text={description} />
                </div>
              )}
            </>
          );
        }}
      />
    </div>
  );
};
