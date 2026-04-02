/**
 * Hackday RTK Query + Redux slice experiment.
 *
 * - Fetches data via RTK Query and logs it to the console
 * - Bridges Jotai annotation state into a Redux slice for Redux DevTools
 *
 * Renders nothing visible — the existing annotation UI is untouched.
 */
import { useCurrentDatasetName, useModalSample } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import {
  current,
  editing,
  isEditing,
  isNew,
} from "../Edit/state";
import {
  activeLabelSchemas,
  activeSchemaTab,
  exploreActiveFields,
  labelSchemasData,
} from "../state";
import { labels as labelsAtom } from "../useLabels";
import {
  setAnnotating,
  setActiveSchemas,
  setEditingLabel,
  setExploreActiveFields,
  setIsNewLabel,
  setLabels,
  setLabelSchemasData,
  setSchemaTab,
  type AnnotationLabel,
} from "./annotationSlice";
import { useGetAppInfoQuery, useGetSampleQuery, useGraphqlQuery } from "./api";
import type { AnnotationAppDispatch } from "./store";

/** Bridges Jotai atoms → Redux slice so state is visible in Redux DevTools */
function JotaiToReduxBridge() {
  const dispatch = useDispatch<AnnotationAppDispatch>();

  const isEditingValue = useAtomValue(isEditing);
  const currentLabel = useAtomValue(current);
  const isNewValue = useAtomValue(isNew);
  const jotaiLabels = useAtomValue(labelsAtom);
  const schemas = useAtomValue(activeLabelSchemas);
  const schemaTab = useAtomValue(activeSchemaTab);
  const schemasData = useAtomValue(labelSchemasData);
  const exploreFields = useAtomValue(exploreActiveFields);

  // Sync editing state
  useEffect(() => {
    dispatch(setAnnotating(isEditingValue));
  }, [isEditingValue]);

  // Sync current label
  useEffect(() => {
    if (currentLabel) {
      const serialized: AnnotationLabel = {
        id: currentLabel.data?._id ?? "unknown",
        path: currentLabel.path,
        type: currentLabel.type,
        cls: currentLabel.data?._cls ?? "",
        label: currentLabel.data?.label,
        confidence: currentLabel.data?.confidence,
        boundingBox: currentLabel.data?.bounding_box,
      };
      dispatch(setEditingLabel(serialized));
    } else {
      dispatch(setEditingLabel(null));
    }
  }, [currentLabel]);

  // Sync isNew
  useEffect(() => {
    dispatch(setIsNewLabel(!!isNewValue));
  }, [isNewValue]);

  // Sync all labels
  useEffect(() => {
    const serialized: AnnotationLabel[] = jotaiLabels.map((l) => ({
      id: l.data?._id ?? "unknown",
      path: l.path,
      type: l.type,
      cls: l.data?._cls ?? "",
      label: l.data?.label,
      confidence: l.data?.confidence,
      boundingBox: l.data?.bounding_box,
    }));
    dispatch(setLabels(serialized));
  }, [jotaiLabels]);

  // Sync active schemas
  useEffect(() => {
    dispatch(setActiveSchemas(schemas ?? []));
  }, [schemas]);

  // Sync schema tab
  useEffect(() => {
    dispatch(setSchemaTab(schemaTab));
  }, [schemaTab]);

  // Sync full schema data (needed by derived selectors)
  useEffect(() => {
    dispatch(setLabelSchemasData(schemasData));
  }, [schemasData]);

  // Sync explore active fields (needed by visibleLabelSchemas selector)
  useEffect(() => {
    dispatch(setExploreActiveFields(exploreFields));
  }, [exploreFields]);

  return null;
}

function ReduxLogger() {
  const appInfo = useGetAppInfoQuery();

  const datasets = useGraphqlQuery({
    query: `query { datasets(search: "") { edges { node { name } } } }`,
  });

  // Read current context from the existing Recoil state
  const datasetName = useCurrentDatasetName();
  const modalSample = useModalSample();
  const sampleId = modalSample?.sample?._id as string | undefined;

  // Fetch the same sample via RTK Query (independent of Relay)
  const sample = useGetSampleQuery(
    datasetName && sampleId ? { dataset: datasetName, sampleId } : undefined!,
    { skip: !datasetName || !sampleId }
  );

  useEffect(() => {
    if (appInfo.data) {
      console.log("[RTK hackday] App info:", appInfo.data);
    }
  }, [appInfo.data]);

  useEffect(() => {
    if (datasets.data) {
      console.log("[RTK hackday] Datasets:", datasets.data);
    }
  }, [datasets.data]);

  useEffect(() => {
    if (sample.data) {
      console.log("[RTK hackday] Sample (via RTK Query):", sample.data);

      // Extract label fields from the sample JSON
      if (sample.data.sample) {
        const labels = Object.fromEntries(
          Object.entries(sample.data.sample).filter(
            ([_key, value]) => value?._cls
          )
        );

        console.log("[RTK hackday] Labels:", labels);
      }
    }

    if (sample.error) {
      console.warn("[RTK hackday] Sample error:", sample.error);
    }
  }, [sample.data, sample.error]);

  return null;
}

export default function ReduxExperiment() {
  return (
    <>
      <JotaiToReduxBridge />
      <ReduxLogger />
    </>
  );
}
