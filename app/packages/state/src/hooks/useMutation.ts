import { useReverbValue } from "@fiftyone/reverb";
import { readOnly } from "../atoms/permission";
import { canPerformAction } from "@fiftyone/utilities";

export default function useMutation(hasPermission: boolean, mutation?: string) {
  const isReadOnly = useReverbValue(readOnly) as boolean;
  return canPerformAction(hasPermission, isReadOnly, mutation);
}
