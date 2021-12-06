import {
  EMBEDDED_DOCUMENT_FIELD,
  LABELS_PATH,
  LABEL_DOC_TYPES,
  withPath,
} from "../../../recoil/constants";

export const MATCH_LABEL_TAGS = {
  path: "tags",
  ftype: EMBEDDED_DOCUMENT_FIELD,
  embeddedDocType: withPath(LABELS_PATH, LABEL_DOC_TYPES),
};

const RESERVED_GROUPS = new Set([
  "sample tags",
  "label tags",
  "patch tags",
  "frame tags",
  "tags",
]);

export const validateGroupName = (name: string): boolean => {
  if (RESERVED_GROUPS.has(name)) {
    alert(`${name.toUpperCase()} is a reserved group`);
    return false;
  }
  return true;
};
