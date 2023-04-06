import { findIndexByKeyValue } from "./findIndexByKeyValue";

export function getPointIndex(trace, id) {
  let idx = findIndexByKeyValue(trace, "id", id);
  if (idx === undefined || idx === null) {
    idx = findIndexByKeyValue(trace, "sample_id", id);
  }
  return idx;
}
