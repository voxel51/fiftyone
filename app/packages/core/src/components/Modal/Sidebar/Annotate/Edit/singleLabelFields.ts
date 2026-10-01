import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { labelSchemasData } from "../state";

/** Single-label types a video frame holds one value of per field. */
const FRAME_SINGLE_LABEL_TYPES = new Set(["classification", "regression"]);

/**
 * The single-label fields a new Classification or Regression can be created
 * in. On video, a `frames.*` field is creatable when it holds one value per
 * frame; a frame-level list (`Classifications`) is not.
 */
export const toCreatableSingleLabelFields = (
  fields: readonly string[],
  isVideo: boolean,
  schemaTypeOf: (path: string) => string | undefined,
): string[] =>
  isVideo
    ? fields.filter(
        (path) =>
          !path.startsWith("frames.") ||
          FRAME_SINGLE_LABEL_TYPES.has(schemaTypeOf(path)?.toLowerCase() ?? ""),
      )
    : [...fields];

export const useCreatableSingleLabelFields = (
  fields: readonly string[],
  isVideo: boolean,
): string[] => {
  const schemas = useAtomValue(labelSchemasData);

  return useMemo(
    () =>
      toCreatableSingleLabelFields(
        fields,
        isVideo,
        (path) => schemas?.[path]?.type,
      ),
    [fields, isVideo, schemas],
  );
};
