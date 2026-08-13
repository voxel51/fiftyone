import {
  CLASSIFICATION,
  CLASSIFICATIONS,
  DETECTION,
  DETECTIONS,
  KEYPOINT,
  KEYPOINTS,
  LABELS,
  LABELS_PATH,
  POLYLINE,
  POLYLINES,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";
import { DefaultValue, atomFamily, selector, selectorFamily } from "recoil";
import { getBrowserStorageEffectForKey } from "./customEffects";
import * as schemaAtoms from "./schema";
import { datasetId } from "./selectors";
import { isPatchesView } from "./view";

export const DEFAULT_SHOWN_LABEL_ATTRIBUTES = ["label"];

const TAG_OVERLAY_TYPES = new Set(
  [CLASSIFICATION, CLASSIFICATIONS].map((cls) => withPath(LABELS_PATH, cls)),
);

// Label types that render their attributes as overlay text in the modal:
// detection box headers, and polyline tags (anchored on the shape's centroid,
// or above the dot for a single-vertex polyline).
const MODAL_LABEL_TEXT_TYPES = new Set(
  [DETECTION, DETECTIONS, POLYLINE, POLYLINES].map((cls) =>
    withPath(LABELS_PATH, cls),
  ),
);

const PATCH_LABEL_TYPES = new Set(
  [DETECTION, DETECTIONS, KEYPOINT, KEYPOINTS, POLYLINE, POLYLINES].map((cls) =>
    withPath(LABELS_PATH, cls),
  ),
);

const shownLabelAttributesStore = atomFamily<Record<string, string[]>, string>({
  key: "shownLabelAttributesStore",
  default: {},
  effects: (id) => [
    getBrowserStorageEffectForKey(`shownLabelAttributes-${id}`, {
      useJsonSerialization: true,
    }),
  ],
});

const shownLabelAttributesMap = selector<Record<string, string[]>>({
  key: "shownLabelAttributesMap",
  get: ({ get }) => get(shownLabelAttributesStore(get(datasetId) ?? "")),
  set: ({ get, set }, value) =>
    set(shownLabelAttributesStore(get(datasetId) ?? ""), value),
});

const labelAttributeNames = selectorFamily<string[], string>({
  key: "labelAttributeNames",
  get:
    (path) =>
    ({ get }) => {
      const expanded = get(schemaAtoms.expandPath(path));
      return get(
        schemaAtoms.fields({
          path: expanded,
          ftype: VALID_PRIMITIVE_TYPES,
        }),
      ).map((field) => field.name);
    },
});

/**
 * The attribute names of a label field rendered as text in looker overlays.
 * An explicitly empty list renders no text. Attributes no longer present in
 * the schema are silently dropped; when a non-empty list loses every valid
 * entry, the default applies.
 */
export const shownLabelAttributes = selectorFamily<string[], string>({
  key: "shownLabelAttributes",
  get:
    (path) =>
    ({ get }) => {
      const stored = get(shownLabelAttributesMap)[path];
      if (!stored) {
        return DEFAULT_SHOWN_LABEL_ATTRIBUTES;
      }

      if (!stored.length) {
        return stored;
      }

      const valid = new Set(get(labelAttributeNames(path)));
      const filtered = stored.filter((attribute) => valid.has(attribute));
      return filtered.length ? filtered : DEFAULT_SHOWN_LABEL_ATTRIBUTES;
    },
  set:
    (path) =>
    ({ get, set }, value) => {
      if (value instanceof DefaultValue) {
        return;
      }

      set(shownLabelAttributesMap, {
        ...get(shownLabelAttributesMap),
        [path]: [...value],
      });
    },
});

/**
 * All customized label fields mapped to their shown attributes, for looker
 * options. Fields without an entry default to showing "label".
 */
export const resolvedShownLabelAttributes = selector<Record<string, string[]>>({
  key: "resolvedShownLabelAttributes",
  get: ({ get }) => {
    const resolved: Record<string, string[]> = {};
    for (const path of Object.keys(get(shownLabelAttributesMap))) {
      if (!get(schemaAtoms.field(path))) {
        continue;
      }

      resolved[path] = get(shownLabelAttributes(path));
    }

    return resolved;
  },
});

/**
 * Whether toggling shown attributes for a label field changes what is
 * rendered in the current context: classification-style tag overlays render
 * everywhere, detection box headers and polyline tags render in the modal, and
 * spatial patch labels render as grid tag overlays in patches views.
 */
export const canToggleShownLabelAttributes = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "canToggleShownLabelAttributes",
  get:
    ({ path, modal }) =>
    ({ get }) => {
      const docType = get(schemaAtoms.field(path))?.embeddedDocType;
      if (!docType) {
        return false;
      }

      if (TAG_OVERLAY_TYPES.has(docType)) {
        return true;
      }

      if (modal) {
        return MODAL_LABEL_TEXT_TYPES.has(docType);
      }

      return PATCH_LABEL_TYPES.has(docType) && get(isPatchesView);
    },
});

/**
 * Resolve a sidebar attribute row path, e.g. "ground_truth.detections.label",
 * to its label field path and attribute name, e.g. "ground_truth" and
 * "label". Returns null when the path is not a label attribute.
 */
export const labelAttributeRow = selectorFamily<
  { labelPath: string; attribute: string } | null,
  string
>({
  key: "labelAttributeRow",
  get:
    (path) =>
    ({ get }) => {
      const segments = path.split(".");
      for (let end = 1; end < segments.length; end++) {
        const prefix = segments.slice(0, end).join(".");
        const docType = get(schemaAtoms.field(prefix))?.embeddedDocType;
        if (!docType || !LABELS.includes(docType)) {
          continue;
        }

        const expanded = get(schemaAtoms.expandPath(prefix));
        if (!path.startsWith(`${expanded}.`)) {
          return null;
        }

        const attribute = path.slice(expanded.length + 1);
        if (
          attribute.includes(".") ||
          !get(labelAttributeNames(prefix)).includes(attribute)
        ) {
          return null;
        }

        return { labelPath: prefix, attribute };
      }

      return null;
    },
});

export const toggleShownLabelAttribute = (
  shown: string[],
  attribute: string,
): string[] =>
  shown.includes(attribute)
    ? shown.filter((name) => name !== attribute)
    : [...shown, attribute];
