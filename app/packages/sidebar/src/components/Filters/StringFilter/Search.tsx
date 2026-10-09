import * as fos from "@fiftyone/state";
import { Combobox, type ComboboxOption, Size } from "@voxel51/voodo";
import { type ReactNode, useEffect, useState } from "react";
import {
  constSelector,
  useReverbValue,
  useReverbValueLoadable,
  useSetReverbState,
} from "@fiftyone/reverb";
import { underline } from "../styles";
import useQueryPerformanceTimeout from "../use-query-performance-timeout";
import type { Result } from "./Result";
import { stringSearch, stringSearchResults } from "./state";

const DEBOUNCE_DELAY = 200;
const NONE_ID = "\u0000none";
const CLOSED = constSelector<{ values?: Result[] }>({ values: [] });

const toId = (value: string | null) => value ?? NONE_ID;

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
 * press Enter. Results are only queried while the list is open.
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
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const isFilterMode = useReverbValue(fos.isSidebarFilterMode);

  const setSearch = useSetReverbState(stringSearch({ modal, path }));
  const debouncedSetSearch = fos.useDebounceCallback(setSearch, DEBOUNCE_DELAY);
  useEffect(() => {
    debouncedSetSearch(input);
  }, [input, debouncedSetSearch]);

  const loadable = useReverbValueLoadable(
    open && searchable ? stringSearchResults({ modal, path }) : CLOSED,
  );
  if (loadable.state === "hasError") throw loadable.contents;
  const loading = loadable.state === "loading";
  const results =
    loadable.state === "hasValue" ? (loadable.contents.values ?? []) : [];

  const options: ComboboxOption[] = results.map(({ value, count }) => ({
    id: toId(value),
    label: value ?? "None",
    description: isFilterMode ? count : undefined,
  }));

  const onChange = async (option: ComboboxOption | null) => {
    if (!option) return;
    const result = results.find(({ value }) => toId(value) === option.id);
    if (await onSelect(result ? result.value : option.label, result)) {
      setInput("");
    }
  };

  return (
    <>
      <Combobox
        size={Size.Sm}
        borderless
        portal
        allowFreeText
        commitOnBlur={false}
        placeholder={placeholder}
        options={options}
        value={null}
        inputValue={input}
        onInputChange={setInput}
        onChange={onChange}
        onOpenChange={setOpen}
        loading={loading}
        header={footer}
        emptyMessage={searchable ? undefined : null}
        inputProps={{
          "data-cy": `selector-sidebar-search-${path}`,
          ...underline(color),
        }}
      />
      {loading && <QueryPerformanceTimeout modal={modal} path={path} />}
    </>
  );
}
