/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The magnifier's popover: where the quick search's similarity settings live.
 * With prompt-capable indexes present it offers the index to search with,
 * the number of matches, and a hand-off to the Similarity Search panel for
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

export const SearchSettingsPopover: React.FC<SearchSettingsPopoverProps> = ({
  trigger,
  promptKeys,
  selectedKey,
  onSelectKey,
  k,
  onChangeK,
  onOpenPanel,
}) => (
  <Popover trigger={trigger} panelClassName={styles.panel}>
    {({ close }) => (
      <Stack
        role="dialog"
        aria-label="Text search settings"
        data-cy="view-bar-search-settings"
        orientation={Orientation.Column}
        spacing={Spacing.Md}
      >
        {promptKeys.length > 0 ? (
          <>
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
                Similarity index
              </Text>
              <Select
                aria-label="Similarity index"
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
                  data: {
                    label: index.patchesField
                      ? `${index.key} (patches: ${index.patchesField})`
                      : index.key,
                  },
                }))}
              />
            </Stack>
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              <Text variant={TextVariant.Label} color={TextColor.Tertiary}>
                Matches
              </Text>
              <Input
                size={Size.Sm}
                type={InputType.Number}
                value={String(k)}
                data-cy="search-settings-k"
                aria-label="Number of matches"
                onChange={(e) =>
                  onChangeK(clampMatches(Number(e.target.value), k))
                }
              />
            </Stack>
          </>
        ) : (
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Text search requires a similarity index that supports prompts.
          </Text>
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
            "Create a similarity index"
          )}
        </Button>
      </Stack>
    )}
  </Popover>
);
