import { useCurrentUser } from "@fiftyone/hooks";
import { AutoRefresh, RadioGroup, Selection } from "@fiftyone/teams-components";
import {
  autoRefreshRunsStatus,
  runsPageFilterDatasetSelectionState,
  runsPageQueryDefaultVariables,
  runsPageQueryDynamicVariables,
  useCurrentDataset,
} from "@fiftyone/teams-state";
import { useRouter } from "next/router";
import { AUTO_REFRESH_INTERVAL_IN_SECONDS } from "@fiftyone/teams-state/src/constants";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import { IconButton, Stack, TextField } from "@mui/material";
import { throttle } from "lodash";
import { useCallback, useEffect, useState } from "react";
import { useRecoilValue, useSetRecoilState, useRecoilState } from "recoil";
import useRefresher, { RUNS_STATUS_REFRESHER_ID } from "../utils/useRefresher";
import RunStatus from "./RunStatus";

export default function RunsFilterSortSearch() {
  const { query } = useRouter();
  const { slug: datasetSlug } = query;
  const currentDataset = useCurrentDataset(datasetSlug as string);

  const [user] = useCurrentUser();
  const id = user?.id;
  const isAdmin = user?.role === "ADMIN";

  const [datasetSelection, setDatasetSelection] = useRecoilState(
    runsPageFilterDatasetSelectionState
  );

  useEffect(() => {
    if (
      isAdmin &&
      window.localStorage.getItem(
        "runs-page-all-this-datasets-filter-last-selected"
      ) === "all"
    ) {
      setDatasetSelection("all");
      setFilter({
        ...filter,
        datasetIdentifier: null,
      });
    }
  }, [isAdmin]);

  const setVars = useSetRecoilState(runsPageQueryDynamicVariables);
  const [filter, setFilter] = useState({
    datasetIdentifier: {
      eq: datasetSelection === "this" ? currentDataset?.id : null,
    },
  });
  const [order, setOrder] = useState(runsPageQueryDefaultVariables.order);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState(null);
  const [statusSelections, setStatusSelections] = useState(["all"]);

  const shouldAutoRefresh = useRecoilValue(autoRefreshRunsStatus);
  const [refresh] = useRefresher(RUNS_STATUS_REFRESHER_ID);

  const handleSearchField = useCallback(
    throttle((term: string) => {
      const sanitizedTerm = term.trim();
      setSearchField(
        sanitizedTerm
          ? { fields: ["operator", "label"], term: sanitizedTerm }
          : null
      );
    }, 500),
    []
  );

  const handleSearch = useCallback(
    (term: string) => {
      setSearch(term);
      handleSearchField(term);
    },
    [setSearch, handleSearchField]
  );

  useEffect(() => {
    setVars((vars) => {
      return { ...vars, search: searchField, order, filter, page: 1 };
    });
  }, [currentDataset, filter, order, searchField, setVars, isAdmin]);

  return (
    <Stack direction="row" pb={1} justifyContent="space-between">
      <Stack direction="row" alignItems="center" spacing={2}>
        <TextField
          value={search}
          size="small"
          placeholder="Filter by operator name"
          InputProps={{
            sx: { pr: 0.5 },
            startAdornment: <SearchIcon color="secondary" sx={{ mr: 1 }} />,
            endAdornment: search ? (
              <IconButton
                size="small"
                onClick={() => {
                  handleSearch("");
                }}
              >
                <CloseIcon color="secondary" />
              </IconButton>
            ) : null,
          }}
          sx={{ minWidth: 250 }}
          onChange={(e) => {
            handleSearch(e.target.value);
          }}
        />
        <Selection
          items={statusFilterItems.map(({ id, label }) => ({
            id,
            label,
            IconComponent:
              id === "all" ? null : <RunStatus variant="circle" status={id} />,
          }))}
          menuSize="small"
          placeholder="Filter by status"
          onChange={(items) => {
            const itemsArray = items as string[];
            const lastItem = itemsArray[itemsArray.length - 1];
            if (lastItem === "all" || itemsArray.length === 0) {
              setStatusSelections(["all"]);
              setFilter({ ...filter, runState: null });
            } else {
              const statuses = itemsArray.filter((status) => status !== "all");
              setFilter({
                ...filter,
                runState: { regexp: statuses.join("|") },
              });
              setStatusSelections(statuses);
            }
          }}
          selectProps={{
            sx: { color: (theme) => theme.palette.text.secondary },
            multiple: true,
            inputProps: { sx: { maxWidth: 100 } },
          }}
          labelPrefix="Status: "
          value={statusSelections}
        />
        {isAdmin && (
          <Selection
            items={DatasetFilterItems.map(({ id, label }) => ({
              id,
              label,
            }))}
            menuSize="small"
            placeholder="Filter by dataset"
            onChange={(item) => {
              if (isAdmin) {
                window?.localStorage.setItem(
                  "runs-page-all-this-datasets-filter-last-selected",
                  item as string
                );
              }
              setDatasetSelection(item as string);
              setFilter({
                ...filter,
                datasetIdentifier:
                  item === "all"
                    ? null
                    : {
                        eq: currentDataset?.id,
                      },
              });
            }}
            selectProps={{
              sx: { color: (theme) => theme.palette.text.secondary },
              inputProps: { sx: { maxWidth: 100 } },
            }}
            value={datasetSelection}
          />
        )}
        <Selection
          items={[
            { id: "all", label: "All runs" },
            { id: "my", label: "My runs" },
          ]}
          defaultValue="all"
          selectProps={{
            sx: {
              color: (theme) => theme.palette.text.secondary,
            },
          }}
          onChange={(value) => {
            setFilter({ ...filter, runBy: value === "my" ? { eq: id } : null });
          }}
        />
      </Stack>
      <Stack direction="row">
        <AutoRefresh
          refresh={refresh}
          paused={!shouldAutoRefresh}
          title={
            "Auto refresh progress of running operators every" +
            ` ${AUTO_REFRESH_INTERVAL_IN_SECONDS} seconds`
          }
          persistanceKey="auto_refresh_runs_list"
        />
        <Selection
          items={[
            { id: "newest", label: "Newest" },
            { id: "oldest", label: "Oldest" },
            { id: "operator", label: "Operator name" },
          ]}
          defaultValue="newest"
          labelPrefix="Sort by: "
          selectProps={{
            sx: {
              color: (theme) => theme.palette.text.secondary,
            },
          }}
          onChange={(value) => {
            setOrder(sortingMap[value as SortingMode]);
          }}
        />
      </Stack>
    </Stack>
  );
}

const sortingMap = {
  newest: { direction: "DESC", field: "updatedAt" },
  oldest: { direction: "ASC", field: "updatedAt" },
  operator: { direction: "ASC", field: "operator" },
};

const statusFilterItems = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "queued", label: "Queued" },
  { id: "running", label: "Running" },
  { id: "scheduled", label: "Scheduled" },
];

const DatasetFilterItems = [
  { id: "all", label: "All datasets" },
  { id: "this", label: "This dataset" },
];

type SortingMode = "newest" | "oldest" | "operator";
