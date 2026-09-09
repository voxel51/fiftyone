/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The magnifier's popover: where the quick search's similarity settings live.
 * With prompt-capable indexes present it offers the index to search with,
 * the number of results, and a hand-off to the Similarity Search panel for
 * everything richer; with none it explains that text search needs an index,
 * and hands off to the panel to create one.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import {
  Align,
  Button,
  Icon,
  IconName,
  Input,
  InputType,
  Orientation,
  Popover,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
  ZIndex,
} from "@voxel51/voodo";
import React from "react";

import styles from "./panel.module.css";

export interface SearchSettingsPopoverProps {
  /** The magnifier: clicking it opens the settings under it. */
  trigger: React.ReactNode;
  promptKeys: PromptableSimilarityIndex[];
  /** The index quick search will use (the resolved value, never null). */
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  k: number;
  onChangeK: (k: number) => void;
  onOpenPanel: () => void;
}

/** Clamp a typed match count to something the search can actually run. */
export const clampMatches = (raw: number, fallback: number): number => {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.round(raw), 1), 10_000);
};

/**
 * How an index reads in the picker: its key, then the model it embeds with
 * when the run recorded one — the model is what tells two keys apart when
 * the keys alone do not — and the patches field for a patches index.
 */
export const describeIndex = (index: PromptableSimilarityIndex): string => {
  const parts = [index.key];
  if (index.model) parts.push(index.model);
  const label = parts.join(" · ");
  return index.patchesField
    ? `${label} (patches: ${index.patchesField})`
    : label;
};

/**
 * The results count, typed freely: the field holds whatever is being typed —
 * including nothing, mid-edit — and reports each value that is a usable
 * count. Clamping every keystroke made the field un-editable: deleting down
 * to an empty field snapped straight back to the old number.
 */
const ResultsInput: React.FC<{ k: number; onChangeK: (k: number) => void }> = ({
  k,
  onChangeK,
}) => {
  const [draft, setDraft] = React.useState(String(k));
  // An outside change (another dataset's remembered count) shows through
  React.useEffect(() => setDraft(String(k)), [k]);
  return (
    <Input
      size={Size.Sm}
      type={InputType.Number}
      min={1}
      value={draft}
      data-cy="search-settings-k"
      aria-label="Number of results"
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() && Number.isFinite(n) && n >= 1) {
          onChangeK(clampMatches(n, k));
        }
      }}
      // Leaving the field empty or invalid keeps the last usable count
      onBlur={() => setDraft(String(k))}
    />
  );
};

export const SearchSettingsPopover: React.FC<SearchSettingsPopoverProps> = ({
  trigger,
  promptKeys,
  selectedKey,
  onSelectKey,
  k,
  onChangeK,
  onOpenPanel,
}) => (
  <Popover
    trigger={trigger}
    panelClassName={styles.panel}
    // Focus stays on the magnifier: moving it into the panel lands on the
    // index picker, which opens its list on focus — a menu nobody asked for —
    // and moving it back on close leaves the magnifier wearing a focus ring
    focusOnOpen={false}
  >
    {({ close }) => (
      <Stack
        role="dialog"
        aria-label="Search settings"
        data-cy="view-bar-search-settings"
        orientation={Orientation.Column}
        spacing={Spacing.Md}
      >
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          <Text variant={TextVariant.Md} color={TextColor.Primary}>
            Search settings
          </Text>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            {promptKeys.length > 0
              ? "Choose the embedding index and how many results to return."
              : "No similarity index yet – plain-language search needs one."}
          </Text>
        </Stack>

        {promptKeys.length > 0 && (
          <>
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
                Index
              </Text>
              <Select
                aria-label="Index"
                data-cy="search-settings-indexes"
                exclusive
                portal
                // The menu must land above the popover panel, not under it
                zIndex={ZIndex.AboveModal}
                value={selectedKey ?? undefined}
                onChange={(value) => {
                  if (typeof value === "string") {
                    onSelectKey(value);
                  }
                }}
                options={promptKeys.map((index) => ({
                  id: index.key,
                  data: { label: describeIndex(index) },
                }))}
              />
            </Stack>
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
                Results
              </Text>
              <ResultsInput k={k} onChangeK={onChangeK} />
            </Stack>
          </>
        )}

        <Button
          variant={Variant.Secondary}
          size={Size.Sm}
          data-cy="search-settings-open-panel"
          onClick={() => {
            onOpenPanel();
            close();
          }}
        >
          {promptKeys.length > 0 ? (
            <Stack
              orientation={Orientation.Row}
              align={Align.Center}
              spacing={Spacing.Xs}
            >
              Open
              {/* the Similarity Search panel's own icon, so the button
                    reads as a pointer to that panel */}
              <Icon name={IconName.ImageSearch} size={Size.Sm} />
              Similarity Search
            </Stack>
          ) : (
            "Set up similarity search"
          )}
        </Button>
      </Stack>
    )}
  </Popover>
);
