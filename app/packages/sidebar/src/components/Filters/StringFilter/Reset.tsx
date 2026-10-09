import * as fos from "@fiftyone/state";
import { isSidebarFilterMode } from "@fiftyone/state";
import { useReverbCallback } from "@fiftyone/reverb";
import { Size, TextAction } from "@voxel51/voodo";

export default function (params: {
  color: string;
  modal: boolean;
  path: string;
}) {
  const handleReset = useReverbCallback(
    ({ snapshot, reset }) =>
      async () => {
        const isFilterMode = await snapshot.getPromise(isSidebarFilterMode);

        reset(isFilterMode ? fos.filter(params) : fos.visibility(params));
      },
    [params.modal, params.path],
  );

  return (
    <TextAction
      size={Size.Sm}
      data-cy="button-Reset"
      onClick={handleReset}
      style={{ marginLeft: "auto" }}
    >
      Reset
    </TextAction>
  );
}
