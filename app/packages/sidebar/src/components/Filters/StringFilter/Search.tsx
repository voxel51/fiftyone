import * as fos from "@fiftyone/state";
import { Input, Size } from "@voxel51/voodo";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  constSelector,
  useReverbValue,
  useReverbValueLoadable,
  useSetReverbState,
} from "@fiftyone/reverb";
import { underline } from "../styles";
import useQueryPerformanceTimeout from "../use-query-performance-timeout";
import type { Result } from "./Result";
import SearchResults, { optionId } from "./SearchResults";
import { stringSearch, stringSearchResults } from "./state";

const DEBOUNCE_DELAY = 200;
const CLOSED = constSelector<{ values?: Result[] }>({ values: [] });

const QueryPerformanceTimeout = ({
  modal,
  path,
}: {
  modal: boolean;
  path: string;
}) => {
  useQueryPerformanceTimeout(modal, path);
  return null;
};

/**
 * Adds a value to a string filter: pick a search result, or type a value and
 * press Enter. Results list in place under the input, and are only queried
 * while it is focused and holds text.
 */
export default function Search({
  color,
  footer,
  modal,
  onSelect,
  path,
  placeholder,
  searchable,
}: {
  color: string;
  footer?: ReactNode;
  modal: boolean;
  onSelect: (value: string | null, result?: Result) => Promise<boolean>;
  path: string;
  placeholder: string;
  searchable: boolean;
}) {
  const listId = useId();
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const isFilterMode = useReverbValue(fos.isSidebarFilterMode);

  const setSearch = useSetReverbState(stringSearch({ modal, path }));
  const debouncedSetSearch = fos.useDebounceCallback(setSearch, DEBOUNCE_DELAY);
  useEffect(() => {
    debouncedSetSearch(input);
  }, [input, debouncedSetSearch]);

  const open = searchable && focused && !dismissed && input.trim() !== "";
  const loadable = useReverbValueLoadable(
    open ? stringSearchResults({ modal, path }) : CLOSED,
  );
  if (loadable.state === "hasError") throw loadable.contents;
  const loading = loadable.state === "loading";
  const results = (
    loadable.state === "hasValue" ? (loadable.contents.values ?? []) : []
  ).map((result) => (isFilterMode ? result : { ...result, count: null }));

  useEffect(() => setActive(null), [loadable.contents]);

  const select = async (value: string | null, result?: Result) => {
    if (await onSelect(value, result)) {
      setInput("");
      setActive(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open || !results.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        current === null
          ? step === 1
            ? 0
            : results.length - 1
          : (current + step + results.length) % results.length,
      );
    } else if (e.key === "Enter") {
      const result = open && active !== null ? results[active] : undefined;
      if (result) {
        select(result.value, result);
      } else if (input.trim()) {
        const match = results.find(({ value }) => value === input.trim());
        select(match ? match.value : input.trim(), match);
      }
    } else if (e.key === "Escape") {
      setDismissed(true);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Input
        size={Size.Sm}
        borderless
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active !== null ? optionId(listId, active) : undefined
        }
        autoComplete="off"
        placeholder={placeholder}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setDismissed(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        data-cy={`selector-sidebar-search-${path}`}
        {...underline(color)}
      />
      {open && (
        <SearchResults
          active={active}
          id={listId}
          loading={loading}
          onPick={(result) => select(result.value, result)}
          results={results}
        />
      )}
      {open && footer}
      {loading && <QueryPerformanceTimeout modal={modal} path={path} />}
    </div>
  );
}
