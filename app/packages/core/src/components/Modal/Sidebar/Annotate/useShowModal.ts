import { State, fieldSchema } from "@fiftyone/state";
import {
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_FIELD,
} from "@fiftyone/utilities";
import { useSetAtom } from "jotai";
import { useRecoilCallback } from "recoil";
import { schemas } from "./state";

const SUPPORTED_ANNOTATION_TYPES = new Set([
  CLASSIFICATION_FIELD,
  CLASSIFICATIONS_FIELD,
  DETECTION_FIELD,
  DETECTIONS_FIELD,
]);

export default function useShowModal() {
  const setSchema = useSetAtom(schemas);

  return useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        const schema = await snapshot.getPromise(
          fieldSchema({ space: State.SPACE.SAMPLE })
        );

        const annotationSchema = {};
        for (const path in schema) {
          const doc = schema[path].embeddedDocType;
          if (doc && SUPPORTED_ANNOTATION_TYPES.has(doc)) {
            annotationSchema[path] = {
              active: false,
              type: doc.split(".").slice(-1)[0],
            };
          }
        }

        setSchema(annotationSchema);
      },
    []
  );
}
