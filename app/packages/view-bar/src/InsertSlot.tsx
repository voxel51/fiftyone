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

import { Icon, IconName, Input, Size, Tooltip, Anchor } from "@voxel51/voodo";
import React from "react";
import { createPortal } from "react-dom";

import { NO_BROWSER_SUGGESTIONS } from "./params";
import { useAnchorRect } from "./StageCard";

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
}

export const InsertSlot: React.FC<InsertSlotProps> = ({
  index,
  names,
  describe,
  onInsert,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // Highlighted stage, driven by the arrow keys. Clamped on read rather than
  // reset by an effect, so it stays valid as the filtered set changes.
  const [highlight, setHighlight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(containerRef, open);

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

  if (!open) {
    return (
      // Anchored to the right, not below: a centered tooltip on the leftmost
      // slot extends past the bar's left edge, and voodo's Tooltip does not
      // slide itself back into view. Beside the "+" it grows away from the
      // edge instead.
      <Tooltip anchor={Anchor.Right} content="Insert stage">
        <div
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
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 12,
            color: "var(--fo-palette-text-secondary)",
            flexShrink: 0,
          }}
        >
          <Icon name={IconName.Add} size={Size.Sm} />
        </div>
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
        autoFocus
        {...NO_BROWSER_SUGGESTIONS}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
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
        aria-expanded={open}
        aria-activedescendant={
          filtered[active] ? `view-bar-stage-${active}` : undefined
        }
        style={{ background: "transparent", border: "none" }}
      />
      {filtered.length > 0 &&
        rect &&
        createPortal(
          <div
            // Portaled to body — avoids being clipped by the bar's
            // overflow rules. Top sits 4px below the trigger's bottom edge.
            style={{
              position: "fixed",
              top: rect.top + 4,
              // Wider than the trigger so descriptions read as sentences,
              // pulled back from the viewport's right edge when the slot
              // sits near it.
              left: Math.min(rect.left, window.innerWidth - LIST_WIDTH - 8),
              width: LIST_WIDTH,
              background: "var(--fo-palette-background-level3)",
              border: "1px solid var(--fo-palette-primary-plainBorder)",
              borderRadius: 4,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
              maxHeight: 360,
              overflowY: "auto",
              zIndex: 10000,
            }}
            role="listbox"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {filtered.map((name, i) => (
              <div
                key={name}
                id={`view-bar-stage-${i}`}
                role="option"
                aria-selected={i === active}
                ref={(el) => {
                  if (i === active) {
                    el?.scrollIntoView({ block: "nearest" });
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(name);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  background:
                    i === active
                      ? "var(--fo-palette-background-level2)"
                      : undefined,
                }}
              >
                <div
                  style={{
                    color: "var(--fo-palette-text-primary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </div>
                {describe(name) && (
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
                    {describe(name)}
                  </div>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
};
