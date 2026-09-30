import type { SavedSubset } from "@fiftyone/state/src/selection";
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Input,
  LoadingDots,
  SearchIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./SelectionTray.module.css";
import { SUBSET_PAGE_SIZE, useSavedSubsets } from "./useSubsetScope";

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
}: {
  datasetId: string;
  view?: readonly unknown[];
  /** Rows for one subset; a mixed subset may render more than one. */
  renderSubset: (subset: SavedSubset) => ReactNode;
  emptyText?: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { subsets, total, count, loading, error } = useSavedSubsets(datasetId, {
    search,
    page,
    view,
  });
  const pages = Math.max(1, Math.ceil(total / SUBSET_PAGE_SIZE));
  useEffect(() => {
    if (!loading && !error) setPage((current) => Math.min(current, pages - 1));
  }, [loading, error, pages]);
  const first = total ? page * SUBSET_PAGE_SIZE + 1 : 0;
  const last = Math.min(total, (page + 1) * SUBSET_PAGE_SIZE);
  return (
    <>
      {count > SUBSET_PAGE_SIZE && (
        <Input
          size={Size.Sm}
          icon={SearchIcon}
          aria-label="Search subsets"
          placeholder={`Search ${count.toLocaleString()} subsets`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      )}
      <div
        role="group"
        aria-label="Subsets"
        className={styles.list}
        aria-busy={loading || undefined}
      >
        {subsets === null && !error ? (
          <LoadingDots
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            text="Loading subsets"
          />
        ) : error ? (
          <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
            {error}
          </Text>
        ) : !subsets?.length ? (
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            className={styles.listEmpty}
          >
            {search.trim() ? "No subsets match" : emptyText}
          </Text>
        ) : (
          subsets.map(renderSubset)
        )}
      </div>
      {total > SUBSET_PAGE_SIZE && (
        <div className={styles.pager}>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            {`${first}–${last} of ${total.toLocaleString()}`}
          </Text>
          <Button
            variant={Variant.Icon}
            size={Size.Xs}
            leadingIcon={ChevronLeftIcon}
            aria-label="Previous subsets"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          />
          <Button
            variant={Variant.Icon}
            size={Size.Xs}
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
