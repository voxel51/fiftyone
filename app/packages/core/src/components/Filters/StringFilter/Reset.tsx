import * as fos from "@fiftyone/state";
import { isSidebarFilterMode, pathColor } from "@fiftyone/state";
import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { Button } from "../../utils";

export default function (params: { modal: boolean; path: string }) {
  const color = useRecoilValue(pathColor(params.path));
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
      color={color}
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
