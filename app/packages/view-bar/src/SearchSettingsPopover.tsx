/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The magnifier's popover: where the quick search's similarity settings live.
 * With prompt-capable indexes present it offers the index to search with,
 * the number of results, which of the index's sources to search when it has
 * them, and a hand-off to the Similarity Search panel for everything richer;
 * with none it explains that text search needs an index, and hands off to
 * the panel to create one.
 */

import type { PromptableSimilarityIndex, SearchSources } from "@fiftyone/state";
import { useTextSearchProviders } from "@fiftyone/state";
import {
  Align,
  Button,
  Checkbox,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  Icon,
  IconName,
  Input,
  InputType,
  Justify,
  MenuTextItem,
  Orientation,
  Popover,
  PopoverAnchor,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, { useEffect } from "react";
import { dispatchSearchSettings } from "./focusPlaced";

import styles from "./panel.module.css";

export interface SearchSettingsPopoverProps {
  /** The magnifier: clicking it opens the settings under it. */
  trigger: React.ReactNode;
  promptKeys: PromptableSimilarityIndex[];
  /** On a grouped dataset, the slices each index covers, by brain key. */
  indexSlices?: ReadonlyMap<string, readonly string[]>;
  /** The index quick search will use (the resolved value, never null). */
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  k: number;
  onChangeK: (k: number) => void;
  /** The selected index's sources, or null when it has none to choose. */
  sources: SearchSources | null;
  /** The sources to search; null searches all of them. */
  selectedSources: string[] | null;
  onChangeSources: (values: string[]) => void;
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

/** An index's name, then the slices it covers as a quiet note, which is
 * what tells an image index from a point-cloud one on a grouped dataset. */
const IndexName: React.FC<{
  index: PromptableSimilarityIndex;
  slices: readonly string[] | undefined;
}> = ({ index, slices }) => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Sm}
  >
    {describeIndex(index)}
    {slices && (
      <Text
        variant={TextVariant.Sm}
        color={TextColor.Secondary}
        data-cy="search-settings-index-slices"
      >
        {slices.join(", ")}
      </Text>
    )}
  </Stack>
);

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

/** Signals the panel mounting and unmounting as the popover opens and closes */
const SettingsOpenSignal = () => {
  useEffect(() => {
    dispatchSearchSettings(true);
    return () => dispatchSearchSettings(false);
  }, []);
  return null;
};

/**
 * The sources to search, as a pill reading "All" or "n of m" that opens a
 * checklist. Unchecking the last one checks them all again: a search over no
 * source would find nothing.
 */
const SourcesPicker: React.FC<{
  sources: SearchSources;
  selected: string[] | null;
  onChange: (values: string[]) => void;
}> = ({ sources, selected, onChange }) => {
  if (sources.unavailableReason) {
    return (
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
          {sources.label}
        </Text>
        <DropdownTrigger
          className={styles.pickerTrigger}
          data-cy="search-settings-sources"
          disabled
        >
          All
        </DropdownTrigger>
        <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
          {sources.unavailableReason}
        </Text>
      </Stack>
    );
  }
  const isChecked = (value: string) => !selected || selected.includes(value);
  const shown = sources.values.filter(isChecked).length;
  const toggle = (value: string) => {
    const next = sources.values.filter((v) =>
      v === value ? !isChecked(v) : isChecked(v),
    );
    onChange(next.length ? next : sources.values);
  };
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
        {sources.label}
      </Text>
      {/* A popover, not a dropdown: a menu closes on every pick, and choosing
          sources takes several. Kept out of a portal so a click in it is not
          a click outside the settings, which would close them */}
      <Popover
        portal={false}
        anchor={PopoverAnchor.BottomStart}
        matchTriggerWidth
        className={styles.picker}
        trigger={
          <DropdownTrigger
            className={styles.pickerTrigger}
            data-cy="search-settings-sources"
          >
            {shown === sources.values.length
              ? "All"
              : `${shown} of ${sources.values.length}`}
          </DropdownTrigger>
        }
      >
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Xs}
          data-cy="search-settings-sources-list"
        >
          {sources.values.map((value) => (
            <Checkbox
              key={value}
              size={Size.Sm}
              label={value}
              checked={isChecked(value)}
              onChange={() => toggle(value)}
            />
          ))}
        </Stack>
      </Popover>
    </Stack>
  );
};

export const SearchSettingsPopover: React.FC<SearchSettingsPopoverProps> = ({
  trigger,
  promptKeys,
  indexSlices,
  selectedKey,
  onSelectKey,
  k,
  onChangeK,
  sources,
  selectedSources,
  onChangeSources,
  onOpenPanel,
}) => {
  const selected = promptKeys.find((index) => index.key === selectedKey);
  // The panel sorts only indexes the server can: one of those anywhere in the
  // dataset is worth a way there, whichever index is selected
  const offerPanel =
    promptKeys.length === 0 || promptKeys.some((index) => !index.provider);
  const providers = useTextSearchProviders();
  const resultsHint = selected?.provider
    ? providers.get(selected.provider)?.resultsHint
    : undefined;
  return (
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
          <SettingsOpenSignal />
          <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
            <Text variant={TextVariant.Md} color={TextColor.Primary}>
              Search settings
            </Text>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {promptKeys.length > 0
                ? "Choose the embedding index and how many results to return."
                : "Add a similarity index once to search this dataset in plain language."}
            </Text>
          </Stack>

          {promptKeys.length > 0 && (
            <>
              <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
                <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
                  Index
                </Text>
                {/* A menu, not a combobox: picking one of a few known indexes
                  is a choice, and a field that accepted typing offered a
                  search nobody needs and opened itself on focus */}
                <Dropdown
                  anchor={DropdownAnchor.BottomStart}
                  className={styles.picker}
                  data-cy="search-settings-indexes"
                  trigger={
                    <DropdownTrigger className={styles.pickerTrigger}>
                      {selected ? (
                        <IndexName
                          index={selected}
                          slices={indexSlices?.get(selected.key)}
                        />
                      ) : (
                        "Choose an index"
                      )}
                    </DropdownTrigger>
                  }
                >
                  {promptKeys.map((index) => (
                    <MenuTextItem
                      key={index.key}
                      aria-current={index.key === selectedKey}
                      onClick={() => onSelectKey(index.key)}
                    >
                      <Stack
                        orientation={Orientation.Row}
                        align={Align.Center}
                        justify={Justify.Between}
                        spacing={Spacing.Sm}
                      >
                        <IndexName
                          index={index}
                          slices={indexSlices?.get(index.key)}
                        />
                        {index.key === selectedKey && (
                          <Icon name={IconName.Check} size={Size.Sm} />
                        )}
                      </Stack>
                    </MenuTextItem>
                  ))}
                </Dropdown>
              </Stack>
              <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
                <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
                  Results
                </Text>
                {resultsHint && (
                  <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
                    {resultsHint}
                  </Text>
                )}
                <ResultsInput k={k} onChangeK={onChangeK} />
              </Stack>
              {sources && (
                <SourcesPicker
                  sources={sources}
                  selected={selectedSources}
                  onChange={onChangeSources}
                />
              )}
            </>
          )}

          {offerPanel && (
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
                "Create index"
              )}
            </Button>
          )}
        </Stack>
      )}
    </Popover>
  );
};
