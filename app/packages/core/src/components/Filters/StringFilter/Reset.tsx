import * as fos from "@fiftyone/state";
import { isSidebarFilterMode } from "@fiftyone/state";
import React from "react";
import { useRecoilCallback } from "recoil";
import { Button } from "../../utils";

export default function (params: {
  color: string;
  modal: boolean;
  path: string;
}) {
  const handleReset = useRecoilCallback(
    ({ snapshot, reset }) =>
      async () => {
        const isFilterMode = await snapshot.getPromise(isSidebarFilterMode);

        reset(isFilterMode ? fos.filter(params) : fos.visibility(params));
      },
    [params.modal, params.path]
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
