/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Natural-language search in the bar: typing a prompt and pressing Enter
 * appends a `SortBySimilarity` stage to the current view. Only offered when
 * the dataset has a sample-level similarity index that accepts text prompts.
 */

import { LoadingDots, useAnchorRect } from "@fiftyone/components";
import type { PromptableSimilarityIndex } from "@fiftyone/state";
import { useViewChangePending } from "@fiftyone/state";
import {
  Clickable,
  Icon,
  IconName,
  Input,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";

import { NO_BROWSER_SUGGESTIONS } from "./params";
import { SearchSettingsPopover } from "./SearchSettingsPopover";

export const LANGUAGE_SEARCH_INPUT_CY = "view-bar-language-search";

/** The bar's text size — chips and slots render at 13px, the search too. */
const SEARCH_FONT_SIZE = 13;

export interface LanguageSearchProps {
  onSubmit: (query: string) => void;
  /** The dataset's prompt-capable indexes, for the wand's settings popover. */
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
  promptKeys,
  selectedKey,
  onSelectKey,
  k,
  onChangeK,
  onOpenPanel,
}) => {
  const [query, setQuery] = React.useState("");
  // Set when the submitted search is still resolving into a view — only the
  // quick search drives the flag, so it can't fire for unrelated loads
  const pending = useViewChangePending();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsRef = React.useRef<HTMLDivElement | null>(null);
  const settingsRect = useAnchorRect(settingsRef, settingsOpen);

  // Click-out closes the settings; clicks inside it are configuration
  React.useEffect(() => {
    if (!settingsOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (settingsRef.current?.contains(target)) return;
      // The popover portals to the body, so it is not a DOM child of the
      // wand — and the index selector's menu portals out of the popover in
      // turn (headlessui), so neither counts as a click-out
      if (target.closest?.('[data-cy="view-bar-search-settings"]')) return;
      if (target.closest?.("[data-headlessui-state]")) return;
      setSettingsOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [settingsOpen]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flex: 1,
        minWidth: 0,
        height: "100%",
        padding: "0 10px 0 6px",
      }}
    >
      {/* The wand is where the search's settings live — which index, how
          many matches, and the hand-off to the Similarity Search panel */}
      <div ref={settingsRef} style={{ position: "relative", flexShrink: 0 }}>
        <Clickable
          role="button"
          tabIndex={0}
          aria-label="Text search settings"
          data-cy="view-bar-search-settings-trigger"
          onClick={() => setSettingsOpen((open) => !open)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSettingsOpen((open) => !open);
            }
          }}
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <Icon name={IconName.AI} size={Size.Sm} />
        </Clickable>
        {settingsOpen && (
          <SearchSettingsPopover
            rect={settingsRect}
            promptKeys={promptKeys}
            selectedKey={selectedKey}
            onSelectKey={onSelectKey}
            k={k}
            onChangeK={onChangeK}
            onOpenPanel={onOpenPanel}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
      {/* voodo's Input roots itself in a block-level Field, so it fills a
          block parent but never grows as a flex item — the growing is this
          wrapper's job, and the field then takes its full width */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <Input
          size={Size.Sm}
          value={query}
          placeholder="Search by text"
          data-cy={LANGUAGE_SEARCH_INPUT_CY}
          {...NO_BROWSER_SUGGESTIONS}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              // The query stays visible — it names the view now loading
              onSubmit(query.trim());
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
      </div>
      {query.trim() && !pending && (
        <Text
          variant={TextVariant.Xs}
          color={TextColor.Tertiary}
          style={{ whiteSpace: "nowrap", flexShrink: 0 }}
        >
          ⏎ Similarity search
        </Text>
      )}
    </div>
  );
};
