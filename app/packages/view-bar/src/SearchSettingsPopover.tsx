/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The wand's popover: where the quick search's similarity settings live.
 * With prompt-capable indexes present it offers the index to search with,
 * the number of matches, and a hand-off to the Similarity Search panel for
 * everything richer; with none it explains that text search exists but needs
 * an index, and hands off to the panel to create one.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import { Button, Icon, IconName, Input, Size, Variant } from "@voxel51/voodo";
import React from "react";

export interface SearchSettingsPopoverProps {
  promptKeys: PromptableSimilarityIndex[];
  /** The index quick search will use (the resolved value, never null). */
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  k: number;
  onChangeK: (k: number) => void;
  onOpenPanel: () => void;
  onClose: () => void;
}

/** Clamp a typed match count to something the search can actually run. */
export const clampMatches = (raw: number, fallback: number): number => {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.round(raw), 1), 10_000);
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--fo-palette-text-tertiary)",
};

export const SearchSettingsPopover: React.FC<SearchSettingsPopoverProps> = ({
  promptKeys,
  selectedKey,
  onSelectKey,
  k,
  onChangeK,
  onOpenPanel,
  onClose,
}) => (
  <div
    data-cy="view-bar-search-settings"
    role="dialog"
    aria-label="Text search settings"
    style={{
      position: "absolute",
      top: "calc(100% + 6px)",
      right: 0,
      zIndex: 10001,
      width: 280,
      padding: 12,
      borderRadius: 4,
      border: "1px solid var(--fo-palette-primary-plainBorder)",
      background: "var(--fo-palette-background-level2)",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    {promptKeys.length > 0 ? (
      <>
        <div style={SECTION_LABEL}>Similarity index</div>
        <div
          role="radiogroup"
          aria-label="Similarity index"
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {promptKeys.map((index) => {
            const active = index.key === selectedKey;
            return (
              <div
                key={index.key}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                data-cy={`search-settings-index-${index.key}`}
                onClick={() => onSelectKey(index.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectKey(index.key);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 6px",
                  borderRadius: 3,
                  cursor: "pointer",
                  background: active
                    ? "var(--fo-palette-background-level1)"
                    : undefined,
                }}
              >
                <Icon
                  name={active ? IconName.Check : IconName.AI}
                  size={Size.Sm}
                />
                <span
                  style={{
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {index.key}
                </span>
                {index.patchesField && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--fo-palette-text-tertiary)",
                      marginLeft: "auto",
                      flexShrink: 0,
                    }}
                  >
                    patches: {index.patchesField}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={SECTION_LABEL}>Matches</div>
        <Input
          size={Size.Sm}
          type="number"
          value={String(k)}
          data-cy="search-settings-k"
          aria-label="Number of matches"
          onChange={(e) => onChangeK(clampMatches(Number(e.target.value), k))}
        />
      </>
    ) : (
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        Search by text finds the samples most similar to what you describe — it
        just needs a similarity index that supports prompts. Create one in the
        Similarity Search panel to enable it.
      </div>
    )}

    <Button
      variant={Variant.Secondary}
      size={Size.Sm}
      data-cy="search-settings-open-panel"
      onClick={() => {
        onOpenPanel();
        onClose();
      }}
    >
      {promptKeys.length > 0
        ? "Open Similarity Search panel"
        : "Create a similarity index"}
    </Button>
  </div>
);
