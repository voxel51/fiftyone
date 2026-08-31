/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Natural-language search in the bar: typing a prompt and pressing Enter
 * appends a `SortBySimilarity` stage to the current view. Only offered when
 * the dataset has a sample-level similarity index that accepts text prompts.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import { useViewChangePending } from "@fiftyone/state";
import { Icon, IconName, Input, Size } from "@voxel51/voodo";
import React from "react";

import { NO_BROWSER_SUGGESTIONS } from "./params";
import { SearchSettingsPopover } from "./SearchSettingsPopover";

export const LANGUAGE_SEARCH_INPUT_CY = "view-bar-language-search";

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

  // Click-out closes the settings; clicks inside it are configuration
  React.useEffect(() => {
    if (!settingsOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsRef.current?.contains(target)) return;
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
        <div
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
          style={{
            display: "inline-flex",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <Icon name={IconName.AI} size={Size.Sm} />
        </div>
        {settingsOpen && (
          <SearchSettingsPopover
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
            ...(pending ? { color: "transparent" } : {}),
          }}
        />
        {pending && (
          <span
            style={{
              position: "absolute",
              left: 8,
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--fo-palette-text-tertiary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            pixelating... {query.trim()}
          </span>
        )}
      </div>
      {query.trim() && !pending && (
        <span
          style={{
            fontSize: 11,
            color: "var(--fo-palette-text-tertiary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          ⏎ Similarity search
        </span>
      )}
    </div>
  );
};
