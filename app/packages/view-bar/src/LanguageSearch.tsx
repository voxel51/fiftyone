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

import { AnchoredListbox, useAnchorRect } from "@fiftyone/components";
import type { PromptableSimilarityIndex } from "@fiftyone/state";
import { useViewChangePending } from "@fiftyone/state";
import {
  Button,
  Icon,
  IconName,
  Input,
  LoadingDots,
  SearchIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";

import { NO_BROWSER_SUGGESTIONS } from "./params";
import { SearchSettingsPopover } from "./SearchSettingsPopover";

export const LANGUAGE_SEARCH_INPUT_CY = "view-bar-language-search";

/** The bar's text size — chips and slots render at 13px, the search too. */
const SEARCH_FONT_SIZE = 13;

/** The no-index dropdown's one row: the on-ramp to creating an index. */
const CONFIGURE_CTA = "Configure similarity search";

export interface LanguageSearchProps {
  onSubmit: (query: string) => void;
  /**
   * Reports whether the input holds text — while it does, this component's
   * own [x] is the bar's one clear affordance, and the bar hides its
   * clear-view [x] rather than showing two.
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

  // The dropdown under the box: previous queries, or the configure CTA when
  // the dataset has no prompt-capable index yet. Focus-gated; option rows
  // preventDefault their mousedown so picking never blurs the input.
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(0);
  // The list offers PREVIOUS queries while composing — a submitted query is
  // no longer a draft, so submitting suppresses the list until the next
  // keystroke or a fresh focus
  const [suppressed, setSuppressed] = React.useState(false);
  const inputWrapRef = React.useRef<HTMLDivElement | null>(null);
  const options = React.useMemo(() => {
    if (!enabled) return [CONFIGURE_CTA];
    const q = query.trim().toLowerCase();
    return q
      ? history.filter((h) => h.toLowerCase().includes(q) && h !== query)
      : [...history];
  }, [enabled, history, query]);
  const listOpen = focused && !pending && !suppressed && options.length > 0;
  const listRect = useAnchorRect(inputWrapRef, listOpen);

  const pick = React.useCallback(
    (option: string) => {
      if (!enabled) {
        // The hand-off closes the dropdown: the keyboard moves to the panel
        inputWrapRef.current?.querySelector("input")?.blur();
        onOpenPanel();
        return;
      }
      setQuery(option);
      setSuppressed(true);
      onSubmit(option);
    },
    [enabled, onOpenPanel, onSubmit],
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flex: 1,
        minWidth: 0,
        height: "100%",
        padding: "0 10px 0 8px",
      }}
    >
      {/* The magnifying glass is where the search's settings live — which
          index, how many matches, and the hand-off to the Similarity Search
          panel (or, with no index, the explanation and the on-ramp) */}
      <SearchSettingsPopover
        trigger={
          <Button
            variant={Variant.Icon}
            size={Size.Sm}
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
      {/* voodo's Input roots itself in a block-level Field, so it fills a
          block parent but never grows as a flex item — the growing is this
          wrapper's job, and the field then takes its full width */}
      <div
        ref={inputWrapRef}
        style={{ flex: 1, minWidth: 0, position: "relative" }}
      >
        <Input
          size={Size.Sm}
          value={query}
          placeholder="Search by natural language"
          data-cy={LANGUAGE_SEARCH_INPUT_CY}
          {...NO_BROWSER_SUGGESTIONS}
          onFocus={() => {
            setFocused(true);
            setSuppressed(false);
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setSuppressed(false);
          }}
          onKeyDown={(e) => {
            if (listOpen && e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, options.length - 1));
            } else if (listOpen && e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              if (enabled && query.trim()) {
                // The query stays visible — it names the view now loading
                setSuppressed(true);
                onSubmit(query.trim());
              } else if (listOpen && options[active]) {
                pick(options[active]);
              }
            } else if (e.key === "Escape" && query) {
              // One Escape clears the draft; the bar's own handler only sees
              // the next press, so an unrelated reset never eats a typed query
              e.stopPropagation();
              setQuery("");
            }
          }}
          style={{
            background: "transparent",
            border: "none",
            // Pinned on the input AND the pending overlay: the overlay must
            // render the term exactly as the input did, and voodo's Sm input
            // (12px) sits under the bar's 13px — one explicit size for both
            fontSize: SEARCH_FONT_SIZE,
            ...(pending ? { color: "transparent" } : {}),
          }}
        />
        {pending && (
          <Text
            color={TextColor.Tertiary}
            style={{
              position: "absolute",
              // The input's own text inset (voodo Sm pads 10px), so the
              // overlay's term sits exactly where the typed term was
              left: 10,
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontSize: SEARCH_FONT_SIZE,
              // Room for descenders — a tight line box plus overflow:hidden
              // cuts the tail off a "g"
              lineHeight: "normal",
            }}
          >
            <LoadingDots text={query.trim()} />
          </Text>
        )}
        <AnchoredListbox
          rect={listRect}
          options={options}
          activeIndex={active}
          onPick={pick}
          onHighlight={setActive}
          optionId={(i) => `view-bar-search-history-${i}`}
          data-cy="view-bar-search-history"
          maxHeight={280}
          renderOption={(option) =>
            enabled ? (
              option
            ) : (
              // The CTA row reads as an action, not a past query
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Secondary}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name={IconName.Settings} size={Size.Sm} />
                {option}
              </Text>
            )
          }
        />
      </div>
    </div>
  );
};
