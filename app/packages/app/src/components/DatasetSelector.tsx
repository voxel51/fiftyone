/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { UseSearch } from "@fiftyone/components";
import { datasetName, useSetDataset } from "@fiftyone/state";
import { Combobox, type ComboboxOption, Size } from "@voxel51/voodo";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";

import styles from "./DatasetSelector.module.css";

/**
 * Dataset typeahead on voodo's `Combobox`. The option list is driven by the
 * parent's `useSearch` hook so server-side dataset search / pagination
 * continues to work for large installs.
 */
const DatasetSelector: React.FC<{
  useSearch: UseSearch<string>;
}> = ({ useSearch }) => {
  const setDataset = useSetDataset();
  const dataset = useRecoilValue(datasetName) as string;

  // Visible text in the input. Decoupled from the *applied* dataset
  // so the user can type a search without losing the active dataset
  // name; the input snaps back when the list closes with nothing picked.
  const [query, setQuery] = useState<string>(dataset ?? "");
  const [open, setOpen] = useState(false);
  // The dataset just picked, held until `datasetName` catches up. Loading a
  // dataset is asynchronous, so without this the snap-back below would
  // overwrite the pick with the dataset still applied — blank, when picking
  // the first dataset from the empty page.
  const [pending, setPending] = useState<string | null>(null);
  // The close that follows a pick runs in the same event as the pick, before
  // `pending` has re-rendered; the ref is what that handler reads
  const pendingRef = useRef<string | null>(null);
  // Whether the visible text is a search the user typed, as opposed to the
  // seeded applied-dataset name. Searching by the seed is worse than useless:
  // the picker opens to browse OTHER datasets, and the debounced refetch made
  // the full list flash before collapsing to the one dataset matching its own
  // name.
  const [dirty, setDirty] = useState(false);

  // `useSearch` debounces internally — re-runs the server query as
  // `query` changes. Returns the current visible result set.
  const { values } = useSearch(open && dirty ? query : "");

  // Snap input text back to the applied dataset name when the
  // dataset selection changes (e.g., via URL or external setter).
  useEffect(() => {
    if (open) return;

    if (pending !== null) {
      if (dataset === pending) {
        pendingRef.current = null;
        setPending(null);
      }
      return;
    }

    setQuery(dataset ?? "");
  }, [dataset, open, pending]);

  const options = useMemo<ComboboxOption[]>(
    () =>
      values.map((name) => ({
        id: name,
        label: name,
        "data-cy": `selector-result-${name}`,
      })),
    [values],
  );

  const value = useMemo<ComboboxOption | null>(
    () => (dataset ? { id: dataset, label: dataset } : null),
    [dataset],
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const pick = useCallback(
    (option: ComboboxOption | null) => {
      // Typing past the applied name reports null; nothing was picked
      if (!option) return;
      pendingRef.current = option.id;
      setPending(option.id);
      setDataset(option.id);
      setQuery(option.id);
      // Choosing a dataset ends the interaction: the keyboard goes back to
      // the page, as it did with the previous selector
      rootRef.current?.querySelector("input")?.blur();
    },
    [setDataset],
  );

  // The e2e harness arms a listener for this before opening the dropdown;
  // the old selector announced its results the same way
  useEffect(() => {
    if (!open) return;
    rootRef.current?.dispatchEvent(
      new CustomEvent("selector-results-dataset", { bubbles: true }),
    );
  }, [open, values]);

  return (
    <div ref={rootRef} data-cy="dataset" className={styles.selector}>
      <Combobox
        aria-label="Dataset"
        placeholder="Select dataset"
        size={Size.Sm}
        options={options}
        value={value}
        inputValue={query}
        onInputChange={(text) => {
          setQuery(text);
          setDirty(true);
        }}
        onChange={pick}
        // Typing then Enter picks the top match
        autoHighlight
        // The header clips overflow — the list must escape it
        portal
        inputProps={{ "data-cy": "selector-dataset" }}
        listProps={{ "data-cy": "selector-results-container-dataset" }}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (isOpen) {
            // Fresh open browses everything; the seeded name is not a search
            setDirty(false);
          } else {
            // Closed with nothing picked: back to the applied name
            // A pick keeps its name in the field while the dataset loads
            setQuery(pendingRef.current ?? dataset ?? "");
          }
        }}
      />
    </div>
  );
};

export default DatasetSelector;
