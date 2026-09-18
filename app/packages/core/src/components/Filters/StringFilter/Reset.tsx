import * as fos from "@fiftyone/state";
import { isSidebarFilterMode } from "@fiftyone/state";
import { useReverbCallback } from "@fiftyone/reverb";
import { Button } from "../../utils";

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
    <Button
      text={"Reset"}
      color={params.color}
      onClick={handleReset}
      style={{
        margin: "0.25rem -0.5rem",
        height: "2rem",
        borderRadius: 0,
        textAlign: "center",
      }}
    />
  );
}
