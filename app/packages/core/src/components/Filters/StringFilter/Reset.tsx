import { isSidebarFilterMode, pathColor } from "@fiftyone/state";
import React from "react";
import { RecoilState, useRecoilCallback, useRecoilValue } from "recoil";
import { Button } from "../../utils";
import { isInListField } from "../state";

export default function ({
  excludeAtom,
  isMatchingAtom,
  path,
  selectedAtom,
}: {
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  path: string;
  selectedAtom: RecoilState<(string | null)[]>;
}) {
  const color = useRecoilValue(pathColor(path));
  const handleReset = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        set(selectedAtom, []);
        set(excludeAtom, false);

        const isFilterMode = await snapshot.getPromise(isSidebarFilterMode);

        const isInList = await snapshot.getPromise(isInListField(path));
        isFilterMode && set(isMatchingAtom, !isInList);
      },
    [excludeAtom, isMatchingAtom, path, selectedAtom]
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
