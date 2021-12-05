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
