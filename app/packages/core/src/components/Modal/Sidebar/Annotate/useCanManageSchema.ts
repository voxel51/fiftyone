import { canManageSchema } from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";

export default function useCanManageSchema() {
  const { enabled } = useReverbValue(canManageSchema);
  return enabled;
}
