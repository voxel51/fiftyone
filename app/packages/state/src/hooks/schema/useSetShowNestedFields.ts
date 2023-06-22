import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { DatasetSchema, getSubPaths } from "../useSchemaSettings.utils";

/**
 *
 * @returns a value and a setter for showNestedField atom/state
 */
export default function useSetShowNestedFields(
  schema: DatasetSchema,
  frameSchema?: DatasetSchema
) {
  const dataset = useRecoilValue(fos.dataset);
  const datasetName = dataset?.name;
  const mediaType = dataset?.mediaType;
  const isVideo = mediaType === "video";

  const [showNestedFields, setShowNestedFieldsRaw] = useRecoilState<boolean>(
    fos.showNestedFieldsState
  );

  const [excludedPaths, setExcludedPaths] = useRecoilState(
    fos.excludedPathsState({})
  );

  const setShowNestedFields = useCallback(
    (val: boolean) => {
      if (!schema) {
        return;
      }

      const newExcludePaths = new Set();
      const datasetExcludedPaths = excludedPaths?.[datasetName];
      if (val) {
        datasetExcludedPaths?.forEach((path) => {
          const subPaths = [
            ...getSubPaths(path, schema, mediaType, frameSchema),
          ];
          subPaths.forEach((path) => {
            newExcludePaths.add(path);
          });
        });
      } else {
        datasetExcludedPaths?.forEach((path: string) => {
          const isTopLevel = !path.includes(".");
          const hasTwoPaths = path.split(".")?.length === 2;
          if (
            isVideo
              ? (hasTwoPaths && path.startsWith("frames.")) || isTopLevel
              : isTopLevel
          ) {
            newExcludePaths.add(path);
          }
        });
      }

      setExcludedPaths({ [datasetName]: newExcludePaths });
      setShowNestedFieldsRaw(val);
    },
    [
      schema,
      setExcludedPaths,
      datasetName,
      setShowNestedFieldsRaw,
      excludedPaths,
      mediaType,
      frameSchema,
      isVideo,
    ]
  );

  return {
    setShowNestedFields,
    showNestedFields,
  };
}
