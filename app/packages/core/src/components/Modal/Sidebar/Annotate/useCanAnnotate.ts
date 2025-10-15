import { readOnly } from "@fiftyone/state";
import { useRecoilValue } from "recoil";

export default function useCanAnnotate() {
  return !useRecoilValue(readOnly);
}
