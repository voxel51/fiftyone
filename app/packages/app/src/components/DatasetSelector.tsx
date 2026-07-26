/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type UseSearch } from "@fiftyone/components";
import { datasetName, useSetDataset } from "@fiftyone/state";
import { Input, Size } from "@voxel51/voodo";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";

/**
 * Hook: returns viewport-coords `{top, left, width}` of an
 * element ref, recomputed on scroll/resize. Used to anchor a
 * portaled dropdown directly below its trigger without being
 * clipped by ancestor `overflow` rules.
 */
const useAnchorRect = (ref: React.RefObject<HTMLElement>, active: boolean) => {
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (!active || !ref.current) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) {
        setRect({ top: r.bottom, left: r.left, width: r.width });
      }
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [active, ref]);

  return rect;
};

/**
 * Dataset typeahead. Skinned with voodo `Input` for visual
 * consistency, but the option list is driven by the parent's
 * `useSearch` hook so server-side dataset search / pagination
 * continues to work for large installs (voodo `Select`'s built-in
 * Combobox only does client-side filtering).
 */
const DatasetSelector: React.FC<{
  useSearch: UseSearch<string>;
}> = ({ useSearch }) => {
  const setDataset = useSetDataset();
  const dataset = useRecoilValue(datasetName) as string;

  // Visible text in the input. Decoupled from the *applied* dataset
  // so the user can type a search without losing the active dataset
  // name; the input snaps back on blur if nothing was picked.
  const [query, setQuery] = useState<string>(dataset ?? "");
  const [open, setOpen] = useState(false);
  // The dataset just picked, held until `datasetName` catches up. Loading a
  // dataset is asynchronous, so without this the snap-back below would
  // overwrite the pick with the dataset still applied — blank, when picking
  // the first dataset from the empty page.
  const [pending, setPending] = useState<string | null>(null);
  // Highlighted option, driven by the arrow keys. Clamped on read rather than
  // reset by an effect, so it stays valid as the result set changes underneath.
  const [highlight, setHighlight] = useState(0);

  // `useSearch` debounces internally — re-runs the server query as
  // `query` changes. Returns the current visible result set.
  const { values } = useSearch(open ? query : "");

  // Snap input text back to the applied dataset name when the
  // dataset selection changes (e.g., via URL or external setter).
  useEffect(() => {
    if (open) return;

    if (pending !== null) {
      if (dataset === pending) setPending(null);
      return;
    }

    setQuery(dataset ?? "");
  }, [dataset, open, pending]);

  const containerRef = useRef<HTMLDivElement>(null);
  const rect = useAnchorRect(containerRef, open);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(pending ?? dataset ?? "");
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open, dataset, pending]);

  const pick = useCallback(
    (name: string) => {
      setPending(name);
      setDataset(name);
      setQuery(name);
      setOpen(false);
      setHighlight(0);
    },
    [setDataset],
  );

  const active = Math.min(highlight, Math.max(0, values.length - 1));

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        // Snug width — the previous 240-300px range pushed into the
        // view bar's flex space. 180px fits a typical dataset name
        // and leaves the bar room to grow.
        width: 180,
        flexShrink: 0,
        // Darker / cooler than level-2 so the selector reads as
        // part of the dark nav chrome rather than a pale grey
        // overlay. Border picks up the primary plain border token
        // to match the bar's frame styling.
        background: "var(--fo-palette-background-level1)",
        borderRadius: 4,
        border: "1px solid var(--fo-palette-primary-plainBorder)",
      }}
      data-cy="dataset"
    >
      <Input
        size={Size.Sm}
        value={query}
        placeholder="Select dataset"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery(pending ?? dataset ?? "");
          } else if (e.key === "ArrowDown") {
            // Arrow keys must not also move the text cursor
            e.preventDefault();
            setOpen(true);
            setHighlight(Math.min(active + 1, values.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight(Math.max(active - 1, 0));
          } else if (e.key === "Enter" && values[active]) {
            pick(values[active]);
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls="dataset-selector-options"
        aria-activedescendant={
          open && values[active] ? `dataset-option-${active}` : undefined
        }
        aria-label="Dataset"
        style={{ background: "transparent", border: "none" }}
      />
      {open &&
        values.length > 0 &&
        rect &&
        createPortal(
          <div
            // Portaled to document.body so ancestor `overflow:auto`
            // rules can't clip the dropdown. Position is computed
            // from the trigger's bounding rect via `useAnchorRect`.
            style={{
              position: "fixed",
              top: rect.top + 4,
              left: rect.left,
              width: rect.width,
              background: "var(--fo-palette-background-level3)",
              border: "1px solid var(--fo-palette-primary-plainBorder)",
              borderRadius: 4,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
              maxHeight: 280,
              overflowY: "auto",
              zIndex: 10000,
            }}
            role="listbox"
            id="dataset-selector-options"
          >
            {values.map((name, i) => (
              <div
                key={name}
                id={`dataset-option-${i}`}
                role="option"
                aria-selected={i === active}
                ref={(el) => {
                  if (i === active) {
                    el?.scrollIntoView({ block: "nearest" });
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(name);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  background:
                    i === active || name === dataset
                      ? "var(--fo-palette-background-level2)"
                      : undefined,
                  color: "var(--fo-palette-text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={name}
              >
                {name}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default DatasetSelector;
