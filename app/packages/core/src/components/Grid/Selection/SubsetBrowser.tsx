import { getEventBus } from "@fiftyone/events";
import type { SavedSubset } from "@fiftyone/state/src/selection";
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Divider,
  Input,
  LoadingDots,
  SearchIcon,
  Text,
} from "@voxel51/voodo";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./SelectionTray.module.css";
import { SUBSET_PAGE_SIZE, useSavedSubsets } from "./useSubsetScope";

/** e2e specs wait on a page of subsets loading before reading the list */
type SubsetBrowserE2EEvents = {
  "e2e:subsets:listed": { count: number };
};

/**
 * The dataset's subsets, five at a time. Past five, a search field appears
 * and a small pager walks the pages; both run on the server so a dataset
 * with hundreds of subsets costs the same as one with six.
 */
export default function SubsetBrowser({
  datasetId,
  view,
  renderSubset,
  emptyText = "No saved subsets yet",
  separateFromPrevious = false,
}: {
  datasetId: string;
  view?: readonly unknown[];
  /** Rows for one subset; a mixed subset may render more than one. */
  renderSubset: (subset: SavedSubset) => ReactNode;
  emptyText?: string;
  /** Separate a short list from preceding content when there is no search. */
  separateFromPrevious?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { subsets, total, count, loading, error } = useSavedSubsets(datasetId, {
    search,
    page,
    view,
  });
  const pages = Math.max(1, Math.ceil(total / SUBSET_PAGE_SIZE));
  // This effect tells e2e specs a page of subsets has finished loading.
  useEffect(() => {
    if (loading) return;
    getEventBus<SubsetBrowserE2EEvents>().dispatch("e2e:subsets:listed", {
      count: subsets?.length ?? 0,
    });
  }, [loading, subsets]);
  // Keep the current page valid after a deletion shrinks the list.
  useEffect(() => {
    if (!loading && !error) setPage((current) => Math.min(current, pages - 1));
  }, [loading, error, pages]);
  const first = total ? page * SUBSET_PAGE_SIZE + 1 : 0;
  const last = Math.min(total, (page + 1) * SUBSET_PAGE_SIZE);
  return (
    <>
      {count > SUBSET_PAGE_SIZE ? (
        <Input
          size="sm"
          icon={SearchIcon}
          aria-label="Search subsets"
          placeholder={`Search ${count.toLocaleString()} subsets`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      ) : separateFromPrevious && count > 0 ? (
        <Divider
          role="separator"
          aria-label="Saved subsets"
          className={styles.rule}
        />
      ) : null}
      <div
        role="group"
        aria-label="Subsets"
        className={styles.list}
        aria-busy={loading || undefined}
      >
        {subsets === null && !error ? (
          <LoadingDots
            variant="body-tertiary"
            color="text-secondary"
            text="Loading subsets"
          />
        ) : error ? (
          <Text variant="body-tertiary" color="text-failure">
            {error}
          </Text>
        ) : !subsets?.length ? (
          (search.trim() || emptyText) && (
            <Text
              variant="body-tertiary"
              color="text-secondary"
              className={styles.listEmpty}
            >
              {search.trim() ? "No subsets match" : emptyText}
            </Text>
          )
        ) : (
          subsets.map(renderSubset)
        )}
      </div>
      {total > SUBSET_PAGE_SIZE && (
        <div className={styles.pager}>
          <Text variant="caption" color="text-secondary">
            {`${first}–${last} of ${total.toLocaleString()}`}
          </Text>
          <Button
            variant="icon"
            size="xs"
            leadingIcon={ChevronLeftIcon}
            aria-label="Previous subsets"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          />
          <Button
            variant="icon"
            size="xs"
            leadingIcon={ChevronRightIcon}
            aria-label="Next subsets"
            disabled={page >= pages - 1}
            onClick={() =>
              setPage((current) => Math.min(pages - 1, current + 1))
            }
          />
        </div>
      )}
    </>
  );
}
