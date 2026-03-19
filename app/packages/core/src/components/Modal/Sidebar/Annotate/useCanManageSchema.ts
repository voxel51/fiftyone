import { canManageSchema } from "@fiftyone/state";
import { useRecoilValue } from "recoil";

export default function useCanManageSchema() {
  const { enabled } = useRecoilValue(canManageSchema);
  return enabled;
}
