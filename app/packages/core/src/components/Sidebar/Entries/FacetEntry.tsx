import { LoadingDots, useTheme } from "@fiftyone/components";
import { useCurrentDatasetId, useSidebarFacet } from "@fiftyone/state";
import { useEffect, useState } from "react";
import Checkbox from "../../Common/Checkbox";
import CategoricalFilterContainer from "../../Filters/StringFilter/Container";
import { ResetButton } from "../../Filters/StringFilter/Reset";
import { Button } from "../../utils";
import { EntryContainer } from "./RegularEntry";

/** A flat facet rendered with the same frame and controls as field filters. */
export default function FacetEntry({
  modal,
  path,
}: {
  modal: boolean;
  path: string;
}) {
  const theme = useTheme();
  const datasetId = useCurrentDatasetId();
  const [offset, setOffset] = useState(0);
  const { values, selected, toggle, clear, total, pageSize, loading, error } =
    useSidebarFacet(modal, path, offset);
  // This effect resets pagination when the dataset changes.
  useEffect(() => setOffset(0), [datasetId]);
  // This effect returns to the first page when other filters shrink the vocabulary.
  useEffect(() => {
    if (!loading && !error && offset > 0 && offset >= total) setOffset(0);
  }, [loading, error, offset, total]);

  return (
    <EntryContainer style={{ backgroundColor: theme.background.level1 }}>
      <div style={{ width: "100%" }}>
        <CategoricalFilterContainer path={path}>
          {error && <div role="alert">{error}</div>}
          {loading && <LoadingDots text="Loading" />}
          {!loading && !error && values.length === 0 && "No results"}
          {values.map((row) => (
            <Checkbox
              key={row.value}
              name={row.label}
              value={selected.includes(row.value)}
              setValue={(checked) => toggle(row.value, checked)}
              count={row.count}
            />
          ))}
          {selected.length > 0 && <ResetButton onClick={clear} />}
          {(offset > 0 || total > pageSize) && (
            <>
              <Button
                text="Previous"
                disabled={loading || offset === 0}
                onClick={() =>
                  setOffset((value) => Math.max(0, value - pageSize))
                }
              />
              <Button
                text="Next"
                disabled={loading || offset + pageSize >= total}
                onClick={() => setOffset((value) => value + pageSize)}
              />
            </>
          )}
        </CategoricalFilterContainer>
      </div>
    </EntryContainer>
  );
}
