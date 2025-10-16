import { useOperatorExecutor } from "@fiftyone/operators";
import { State, fieldSchema, mediaType } from "@fiftyone/state";
import {
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
} from "@fiftyone/utilities";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { fieldTypes, schemas } from "./state";

const IMAGE = "image";
const THREE_D = "3d";

const SUPPORTED_ANNOTATION_TYPES = {
  [IMAGE]: new Set([
    CLASSIFICATION_FIELD,
    CLASSIFICATIONS_FIELD,
    DETECTION_FIELD,
    DETECTIONS_FIELD,
  ]),
  [THREE_D]: new Set([
    CLASSIFICATION_FIELD,
    CLASSIFICATIONS_FIELD,
    POLYLINE_FIELD,
    POLYLINES_FIELD,
  ]),
};
export default function useLoadSchemas() {
  const setSchema = useSetAtom(schemas);
  const setTypes = useSetAtom(fieldTypes);
  const get = useOperatorExecutor("get_annotation_schemas");
  const type = useRecoilValue(mediaType);

  useEffect(() => {
    get.result && setSchema(get.result.schemas);
  }, [get.result, setSchema]);

  return useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        const schema = await snapshot.getPromise(
          fieldSchema({ space: State.SPACE.SAMPLE })
        );
        const types = {};

        const paths: string[] = [];
        for (const path in schema) {
          const doc = schema[path].embeddedDocType;
          if (doc && SUPPORTED_ANNOTATION_TYPES[type ?? ""]?.has(doc)) {
            paths.push(path);
            types[path] = doc?.split(".").slice(-1)[0];
          }
        }

        get.execute({ paths });
        setTypes(types);
      },
    [type, setTypes]
  );
}
