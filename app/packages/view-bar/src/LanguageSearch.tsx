/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Natural-language search in the bar: typing a prompt and pressing Enter
 * appends a `SortBySimilarity` stage to the current view. Only offered when
 * the dataset has a sample-level similarity index that accepts text prompts.
 */

import { Icon, IconName, Input, Size, Tooltip, Anchor } from "@voxel51/voodo";
import React from "react";

import { NO_BROWSER_SUGGESTIONS } from "./params";

export const LANGUAGE_SEARCH_INPUT_CY = "view-bar-language-search";

export interface LanguageSearchProps {
  onSubmit: (query: string) => void;
}

export const LanguageSearch: React.FC<LanguageSearchProps> = ({ onSubmit }) => {
  const [query, setQuery] = React.useState("");

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
      <Icon name={IconName.AI} size={Size.Sm} />
      {/* voodo's Input roots itself in a block-level Field, so it fills a
          block parent but never grows as a flex item — the growing is this
          wrapper's job, and the field then takes its full width */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Input
          size={Size.Sm}
          value={query}
          placeholder="Search with natural language"
          data-cy={LANGUAGE_SEARCH_INPUT_CY}
          {...NO_BROWSER_SUGGESTIONS}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              onSubmit(query.trim());
              setQuery("");
            } else if (e.key === "Escape" && query) {
              // One Escape clears the draft; the bar's own handler only sees
              // the next press, so an unrelated reset never eats a typed query
              e.stopPropagation();
              setQuery("");
            }
          }}
          style={{ background: "transparent", border: "none" }}
        />
      </div>
      {query.trim() && (
        <span
          style={{
            fontSize: 11,
            color: "var(--fo-palette-text-tertiary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          ⏎ Sort by similarity
        </span>
      )}
    </div>
  );
};

/**
 * The search affordance while the stage row is expanded: a single icon that
 * hands the bar back to the collapsed layout, where the full input lives.
 */
export const LanguageSearchButton: React.FC<{ onOpen: () => void }> = ({
  onOpen,
}) => (
  <Tooltip anchor={Anchor.Bottom} content="Search with natural language">
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Search with natural language"
      data-cy="view-bar-language-search-button"
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: 12,
        color: "var(--fo-palette-text-secondary)",
        flexShrink: 0,
      }}
    >
      <Icon name={IconName.Search} size={Size.Sm} />
    </div>
  </Tooltip>
);
