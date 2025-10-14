import { canCreateNewField } from "@fiftyone/state";
import { useRecoilValue } from "recoil";

export default function useCanManageSchema() {
  return useRecoilValue(canCreateNewField);
}
