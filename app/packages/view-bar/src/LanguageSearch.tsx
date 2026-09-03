/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Similarity search in the bar: typing a prompt and pressing Enter appends a
 * `SortBySimilarity` stage to the current view. The box always renders —
 * without a prompt-capable index it becomes the on-ramp: its dropdown offers
 * "Configure similarity search", which opens the Similarity Search panel.
 *
 * The magnifying glass is where the search's settings live (which index, how
 * many matches); focusing the input offers the dataset's previous queries.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import { useViewChangePending } from "@fiftyone/state";
import {
  Align,
  Button,
  Combobox,
  type ComboboxOption,
  IconName,
  LoadingDots,
  Orientation,
  SearchIcon,
  Size,
  Spacing,
  Stack,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";

import styles from "./LanguageSearch.module.css";
import { SearchSettingsPopover } from "./SearchSettingsPopover";

export const LANGUAGE_SEARCH_LABEL = "Search by natural language";

export interface LanguageSearchProps {
  onSubmit: (query: string) => void;
  /**
   * Reports whether the input holds text — while it does, the bar's clear
   * [x] shows even with no stages applied.
   */
  onHasTextChange?: (hasText: boolean) => void;
  /** Whether a prompt-capable index exists — typing only searches with one. */
  enabled: boolean;
  /** The dataset's previous queries, most recent first. */
  history: readonly string[];
  /** The dataset's prompt-capable indexes, for the settings popover. */
  promptKeys: PromptableSimilarityIndex[];
  /** The index quick search will use. */
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  k: number;
  onChangeK: (k: number) => void;
  onOpenPanel: () => void;
}

export const LanguageSearch: React.FC<LanguageSearchProps> = ({
  onSubmit,
  onHasTextChange,
  enabled,
  history,
  promptKeys,
  selectedKey,
  onSelectKey,
  k,
  onChangeK,
  onOpenPanel,
}) => {
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    onHasTextChange?.(!!query);
    return () => onHasTextChange?.(false);
  }, [query, onHasTextChange]);
  // Set when the submitted search is still resolving into a view — only the
  // quick search drives the flag, so it can't fire for unrelated loads
  const pending = useViewChangePending();

  // The dropdown under the box: previous queries matching the draft. With no
  // prompt-capable index there is nothing to offer, and the empty state is
  // the on-ramp to creating one
  const options = React.useMemo<ComboboxOption[]>(() => {
    if (!enabled) return [];
    const q = query.trim().toLowerCase();
    return history
      .filter((h) => !q || h.toLowerCase().includes(q))
      .map((h) => ({ id: h, label: h }));
  }, [enabled, history, query]);

  // A picked row or committed text: a previous query re-runs, typed text runs
  const commit = React.useCallback(
    (option: ComboboxOption | null) => {
      if (!option || !enabled) return;
      const text = option.label.trim();
      if (!text) return;
      // The query stays visible — it names the view now loading
      setQuery(text);
      onSubmit(text);
    },
    [enabled, onSubmit],
  );

  return (
    <Stack
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Xs}
      className={styles.root}
    >
      {/* The magnifying glass is where the search's settings live — which
          index, how many matches, and the hand-off to the Similarity Search
          panel (or, with no index, the explanation and the on-ramp) */}
      <SearchSettingsPopover
        trigger={
          <Button
            variant={Variant.Icon}
            size={Size.Xs}
            borderless
            leadingIcon={SearchIcon}
            aria-label="Similarity search settings"
            data-cy="view-bar-search-settings-trigger"
          />
        }
        promptKeys={promptKeys}
        selectedKey={selectedKey}
        onSelectKey={onSelectKey}
        k={k}
        onChangeK={onChangeK}
        onOpenPanel={onOpenPanel}
      />
      <Combobox
        aria-label={LANGUAGE_SEARCH_LABEL}
        placeholder={LANGUAGE_SEARCH_LABEL}
        size={Size.Sm}
        className={styles.field}
        options={options}
        // Nothing is ever "picked": a search is an action, so every commit
        // arrives through onChange and the field keeps the text it ran with
        value={null}
        inputValue={query}
        onInputChange={setQuery}
        onChange={commit}
        allowFreeText={enabled}
        // Enter runs the search; clicking elsewhere must not
        commitOnBlur={false}
        // The bar's gutter clips overflow — the list must escape it
        portal
        // The field sits flush in the bar; the bar is its frame
        borderless
        // With previous searches to offer the list is the offer; with none it
        // is noise, so it stays hidden
        emptyMessage={
          enabled
            ? null
            : // Text search needs a similarity index that supports prompts;
              // the list's one offer is to go make one, and taking it is
              // leaving the field
              ({ close }) => (
                <Button
                  variant={Variant.Secondary}
                  size={Size.Sm}
                  className={styles.configure}
                  leadingIcon={IconName.Settings}
                  onClick={() => {
                    close();
                    onOpenPanel();
                  }}
                >
                  Configure similarity search
                </Button>
              )
        }
      />
      {pending && (
        // Legible even for a sub-second search: a word, not just the dots — the
        // grid's own word for it
        <LoadingDots
          text="Pixelating"
          variant={TextVariant.Sm}
          color={TextColor.Tertiary}
        />
      )}
    </Stack>
  );
};
