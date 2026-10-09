/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getEventBus } from "@fiftyone/events";
import { useReverbValue } from "@fiftyone/reverb";
import { datasetName, useSetDataset } from "@fiftyone/state";
import {
  CaretDownIcon,
  CheckIcon,
  DatabaseIcon,
  GridViewIcon,
  IconColor,
  Input,
  MenuSectionTitle,
  MenuSeparator,
  Popover,
  PopoverAnchor,
  SearchIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { useCallback, useEffect, useState } from "react";

import { useDatasetDisplayName } from "../product";
import styles from "./DatasetSelector.module.css";

/** e2e specs wait on the open list's results before reading them */
type DatasetSelectorE2EEvents = {
  "e2e:components:selector-results": { cy?: string };
};

type UseSearch = (search: string) => { values: string[]; total?: number };

/**
 * The dataset crumb: a pill naming the loaded dataset that opens a searchable
 * list of datasets. The list is driven by the parent's `useSearch` hook so
 * server-side dataset search and pagination keep working for large installs.
 */
const DatasetSelector: React.FC<{
  useSearch: UseSearch;
  /** The header is out of sight; an open list closes with it. */
  hidden?: boolean;
}> = ({ useSearch, hidden }) => {
  const setDataset = useSetDataset();
  const dataset = useReverbValue(datasetName) as string | null;
  // A product may display a dataset under a different name than the one the
  // router loads, which stays `dataset` throughout
  const displayName = useDatasetDisplayName();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Loading a dataset is asynchronous; the pill names the pick until the
  // route catches up, rather than the dataset being left
  const [pending, setPending] = useState<string | null>(null);

  const { values } = useSearch(open ? query : "");

  useEffect(() => {
    if (pending !== null && dataset === pending) setPending(null);
  }, [dataset, pending]);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    getEventBus<DatasetSelectorE2EEvents>().dispatch(
      "e2e:components:selector-results",
      { cy: "dataset" },
    );
  }, [open, values]);

  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    setActive(0);
    if (!next) setQuery("");
  }, []);

  const pick = (name: string | null) => {
    changeOpen(false);
    // Picking the dataset already open is a no-op, not a reload of it
    if (name === dataset) return;
    setPending(name);
    setDataset(name);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!values.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + values.length) % values.length);
    } else if (event.key === "Enter" && values[active]) {
      event.preventDefault();
      pick(values[active]);
    }
  };

  const label = pending ?? displayName;

  return (
    <Popover
      open={open && !hidden}
      onOpenChange={changeOpen}
      anchor={PopoverAnchor.BottomStart}
      panelClassName={styles.panel}
      trigger={
        <button
          type="button"
          className={clsx(styles.trigger, open && styles.open)}
          onClick={() => changeOpen(!open)}
          aria-label="Switch dataset"
          aria-expanded={open}
          aria-haspopup="dialog"
          data-cy="selector-dataset"
        >
          <DatabaseIcon size={14} color={IconColor.Default} />
          <Text
            variant={TextVariant.HeadingSm}
            color={label ? TextColor.Primary : TextColor.Secondary}
            className={styles.name}
          >
            {label ?? "Select dataset"}
          </Text>
          <CaretDownIcon size={14} color={IconColor.Default} />
        </button>
      }
    >
      <div className={styles.search}>
        <Input
          type="search"
          size={Size.Sm}
          icon={SearchIcon}
          placeholder="Find dataset"
          aria-label="Find dataset"
          role="combobox"
          aria-expanded
          aria-controls="dataset-selector-results"
          aria-activedescendant={
            values[active] ? `dataset-option-${active}` : undefined
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          data-cy="selector-dataset-search"
        />
      </div>
      <MenuSectionTitle>Datasets</MenuSectionTitle>
      <div
        id="dataset-selector-results"
        role="listbox"
        aria-label="Datasets"
        className={styles.results}
        data-cy="selector-results-container-dataset"
      >
        {values.map((name, index) => (
          <div
            key={name}
            id={`dataset-option-${index}`}
            role="option"
            aria-selected={name === dataset}
            className={clsx(styles.row, index === active && styles.active)}
            onMouseEnter={() => setActive(index)}
            onClick={() => pick(name)}
            data-cy={`selector-result-${name}`}
          >
            <Text
              variant={TextVariant.BodySecondary}
              color={TextColor.Primary}
              className={styles.name}
            >
              {name}
            </Text>
            {name === dataset && (
              <CheckIcon size={14} color={IconColor.Default} />
            )}
          </div>
        ))}
      </div>
      {!values.length && (
        <Text
          variant={TextVariant.BodySecondary}
          color={TextColor.Secondary}
          className={styles.empty}
        >
          No datasets match
        </Text>
      )}
      <MenuSeparator />
      <button
        type="button"
        className={styles.row}
        onClick={() => pick(null)}
        data-cy="selector-all-datasets"
      >
        <GridViewIcon size={14} color={IconColor.Default} />
        <Text variant={TextVariant.BodySecondary} color={TextColor.Primary}>
          All datasets
        </Text>
      </button>
    </Popover>
  );
};

export default DatasetSelector;
