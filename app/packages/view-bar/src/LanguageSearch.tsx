/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Similarity search in the bar: typing a prompt and pressing Enter appends a
 * `SortBySimilarity` stage to the current view. The box always renders —
 * without a prompt-capable index it becomes the on-ramp: its dropdown asks
 * for a similarity index, and both that dropdown's action and Enter open the
 * Similarity Search panel to create one.
 *
 * The magnifying glass is where the search's settings live (which index, how
 * many results); focusing the input offers the dataset's previous queries.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import { useCurrentDatasetName, useViewChangePending } from "@fiftyone/state";
import {
  Align,
  Button,
  Combobox,
  type ComboboxOption,
  Icon,
  IconName,
  LoadingDots,
  Orientation,
  SearchIcon,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";

import styles from "./LanguageSearch.module.css";
import { rememberQuery } from "./searchQueryHistory";
import { SearchSettingsPopover } from "./SearchSettingsPopover";
import { useLanguageSearchExtension } from "./useLanguageSearchExtension";

export const LANGUAGE_SEARCH_LABEL = "Search or ask in natural language";

export interface LanguageSearchProps {
  onSubmit: (query: string) => void;
  /**
   * Reports whether the input holds text — while it does, the bar's clear
   * [x] shows even with no stages applied.
   */
  onHasTextChange?: (hasText: boolean) => void;
  /** The input taking focus — the bar folds its stages row behind it. */
  onFocus?: () => void;
  /**
   * Whether the similarity search operator may exist — registered, or not yet
   * known to be missing while the registry loads. Known missing, the field
   * still shows, and a click explains itself through `onUnavailable` instead
   * of offering anything. An index a text search extension searches needs
   * neither this nor `enabled`: the field searches it regardless.
   */
  available: boolean;
  onUnavailable: () => void;
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

/**
 * The field, remounted per dataset: a query typed over one dataset means
 * nothing in the next, and a search still running for it must not publish
 * there. The bar itself stays mounted across the switch.
 */
export const LanguageSearch: React.FC<LanguageSearchProps> = (props) => {
  const datasetName = useCurrentDatasetName();
  return <LanguageSearchField key={datasetName ?? ""} {...props} />;
};

const LanguageSearchField: React.FC<LanguageSearchProps> = ({
  onSubmit,
  onHasTextChange,
  onFocus,
  available: operatorAvailable,
  onUnavailable,
  enabled: indexEnabled,
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
  // Set while the submitted search is still running — only the quick search
  // drives the flag, so it can't fire for unrelated loads
  const pending = useViewChangePending();
  // An index a text search extension searches client-side runs here, not
  // through `onSubmit`
  const { run: runExtensionSearch, recentQueries } =
    useLanguageSearchExtension();
  const shownHistory = React.useMemo(
    () =>
      recentQueries.reduceRight(
        (queries, q) => rememberQuery(queries, q),
        [...history],
      ),
    [recentQueries, history],
  );
  // An extension searches client-side and publishes to the extended
  // selection: it needs neither the operator nor `SortBySimilarity`
  const extensionSearch = Boolean(
    promptKeys.find((key) => key.key === selectedKey)?.extension,
  );
  const available = operatorAvailable || extensionSearch;
  const enabled = indexEnabled || extensionSearch;

  // The dropdown under the box: previous queries matching the draft. With no
  // prompt-capable index there is nothing to offer, and the empty state is
  // the on-ramp to creating one
  const options = React.useMemo<ComboboxOption[]>(() => {
    if (!available || !enabled) return [];
    const q = query.trim().toLowerCase();
    return shownHistory
      .filter((h) => !q || h.toLowerCase().includes(q))
      .map((h) => ({ id: h, label: h }));
  }, [available, enabled, shownHistory, query]);

  // A picked row or committed text: a previous query re-runs, typed text
  // runs. With no index there is nothing to run, and the query is the reason
  // to make one — so it opens the panel the empty state points at
  const commit = React.useCallback(
    (option: ComboboxOption | null) => {
      if (!option || !available) return;
      const text = option.label.trim();
      if (!text) return;
      // The query stays visible — it names the view now loading
      setQuery(text);
      if (!enabled) {
        onOpenPanel();
        return;
      }
      const index = promptKeys.find((key) => key.key === selectedKey);
      if (index?.extension) {
        // Never to `onSubmit`, even with its extension gone: the server
        // cannot sort this index
        runExtensionSearch(index, text, k);
        return;
      }
      onSubmit(text);
    },
    [
      available,
      enabled,
      onOpenPanel,
      onSubmit,
      promptKeys,
      selectedKey,
      runExtensionSearch,
      k,
    ],
  );

  return (
    <Stack
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Xs}
      className={styles.root}
    >
      {/* The magnifying glass is where the search's settings live — which
          index, how many results, and the hand-off to the Similarity Search
          panel (or, with no index, the explanation and the on-ramp). It
          floats over the field's leading padding so the field — and the
          list anchored to it — starts at the bar's left edge. */}
      <div className={styles.magnifier}>
        {pending ? (
          // Shut while a search runs: switching the index mid-search could
          // let a server search, which cannot be cancelled, land over the
          // newer one
          <Spinner
            size={Size.Xs}
            aria-label="Search in progress"
            data-cy="view-bar-search-in-progress"
          />
        ) : (
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
        )}
      </div>
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
        onFocus={onFocus}
        // Committed without an index, the text is a request for one
        allowFreeText={available}
        // Without the operator there is nothing to open; the click gets an
        // explanation instead
        onOpenChange={(isOpen) => {
          if (isOpen && !available) onUnavailable();
        }}
        // Enter runs the search; clicking elsewhere must not
        commitOnBlur={false}
        // The bar's gutter clips overflow — the list must escape it
        portal
        // The field sits flush in the bar; the bar is its frame
        borderless
        // With previous searches to offer the list is the offer; with none it
        // is noise, so it stays hidden
        emptyMessage={
          !available || enabled
            ? null
            : // Text search needs a similarity index that supports prompts:
              // the list says so, and its one action is to go make one —
              // taking it is leaving the field
              ({ close }) => (
                <div
                  className={styles.emptyState}
                  data-cy="view-bar-search-no-index"
                >
                  <Icon
                    name={IconName.Embeddings}
                    size={Size.Sm}
                    color={TextColor.Secondary}
                  />
                  <div className={styles.emptyCopy}>
                    <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                      Describe what you’re looking for
                    </Text>
                    <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
                      Add a similarity index once to search this dataset in
                      plain language.
                    </Text>
                  </div>
                  <Button
                    variant={Variant.Borderless}
                    size={Size.Sm}
                    onClick={() => {
                      close();
                      onOpenPanel();
                    }}
                  >
                    Create index
                  </Button>
                </div>
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
