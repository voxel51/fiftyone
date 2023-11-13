import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { Button } from "../../utils";

const useReset = (options: {
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}) => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        set(fos.rangeAtom({ ...options, withBounds: true }), [null, null]);
        set(fos.numericExcludeAtom(options), false);

        const listField = await snapshot.getPromise(
          fos.isListField(options.path)
        );
        (await snapshot.getPromise(fos.isSidebarFilterMode)) &&
          set(fos.numericIsMatchingAtom(options), !listField);
      },
    [options]
  );
};

function Reset({
  defaultRange,
  modal,
  path,
}: {
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}) {
  const color = useRecoilValue(fos.pathColor(path));
  const hasVisibilitySetting = useRecoilValue(
    fos.fieldHasVisibilitySetting({ modal, path })
  );
  const isFiltered = useRecoilValue(fos.fieldIsFiltered({ modal, path }));
  const reset = useReset({ defaultRange, modal, path });

  if (!isFiltered && !hasVisibilitySetting) {
    return null;
  }

  return (
    <Button
      text={"Reset"}
      color={color}
      onClick={reset}
      style={{
        margin: "0.25rem -0.5rem",
        height: "2rem",
        borderRadius: 0,
        textAlign: "center",
      }}
    />
  );
}

export default Reset;
