import {
  currentDatasetFilters,
  useExportView,
  useFetchData,
} from "@fiftyone/hooks";
import { view } from "@fiftyone/state";
import { Box, TableSkeleton } from "@fiftyone/teams-components";
import { exportType } from "@fiftyone/teams-state";
import { EXPORT_OPTIONS } from "@fiftyone/teams-state/src/constants";
import { isObjectEmpty } from "@fiftyone/teams-utilities/src/isObjectEmpty";
import { Suspense, useEffect, useMemo } from "react";
import { useRecoilCallback, useRecoilState } from "recoil";
import ViewOrDatasetSelection from "../ViewSelection";
import DataSelection from "./DataSelection";
import ExportInfo from "./ExportInfo";
import FieldSelection from "./FieldSelection";
import LabelFormatSelection from "./LabelFormatSelection";

export default function ExportForm() {
  const { format, data, selectionIsValid, hasLabels } = useExportView();
  const [type, setType] = useRecoilState(exportType);
  const { sourceView, fetchData } = useFetchData(setType);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isFilterNull = sourceView ? isObjectEmpty(sourceView) : true;

  const viewOptions = useMemo(() => {
    if (isFilterNull) {
      return [EXPORT_OPTIONS.DATASET_WITHOUT_RUN];
    }
    return [EXPORT_OPTIONS.WITH_FILTER, EXPORT_OPTIONS.DATASET_WITHOUT_RUN];
  }, [isFilterNull]);

  return (
    <Box>
      <ViewOrDatasetSelection
        type={type}
        setType={setType}
        options={viewOptions}
      />
      <DataSelection />
      {hasLabels && (
        <Suspense fallback={<TableSkeleton rows={1} />}>
          <LabelFormatSelection key={data} />
        </Suspense>
      )}
      {Boolean(format) && (
        <Suspense fallback={<TableSkeleton rows={1} />}>
          <FieldSelection />
        </Suspense>
      )}
      {Boolean(selectionIsValid) && (
        <Suspense fallback={<TableSkeleton rows={1} />}>
          <ExportInfo key={data} />
        </Suspense>
      )}
    </Box>
  );
}
