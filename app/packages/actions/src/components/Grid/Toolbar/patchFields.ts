import * as fos from "@fiftyone/state";
import {
  CLIPS_FRAME_FIELDS,
  CLIPS_SAMPLE_FIELDS,
  EMBEDDED_DOCUMENT_FIELD,
  PATCHES_FIELDS,
} from "@fiftyone/utilities";
import { selector } from "@fiftyone/reverb";

export const patchesFields = selector<string[]>({
  key: "patchesFields",
  get: ({ get }) => {
    const paths = get(fos.labelFields({}));
    return paths.filter((p) =>
      get(
        fos.meetsType({
          path: p,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: PATCHES_FIELDS,
        }),
      ),
    );
  },
});

export const clipsFields = selector<string[]>({
  key: "clipsFields",
  get: ({ get }) =>
    [
      ...get(
        fos.fieldPaths({
          space: fos.State.SPACE.FRAME,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: CLIPS_FRAME_FIELDS,
        }),
      ),
      ...get(
        fos.fieldPaths({
          space: fos.State.SPACE.SAMPLE,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: CLIPS_SAMPLE_FIELDS,
        }),
      ),
    ].sort(),
});

export const evaluationKeys = selector<string[]>({
  key: "evaluationKeys",
  get: ({ get }) => {
    const paths = get(fos.labelFields({}));
    const valid = paths.filter((p) =>
      get(
        fos.meetsType({
          path: p,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: PATCHES_FIELDS,
        }),
      ),
    );

    return (
      get(fos.dataset)
        ?.evaluations.filter(
          (e) =>
            valid.includes(e.config.predField) ||
            valid.includes(e.config.gtField),
        )
        .map(({ key }) => key) ?? []
    );
  },
});
