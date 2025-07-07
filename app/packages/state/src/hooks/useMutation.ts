import { useRecoilValue } from "recoil";
import { readOnly } from "../recoil/permission";
import { canPerformAction } from "@fiftyone/utilities";

export default function useMutation(hasPermission: boolean, mutation?: string) {
  const isReadOnly = useRecoilValue(readOnly) as boolean;
  return canPerformAction(hasPermission, isReadOnly, mutation);
}
