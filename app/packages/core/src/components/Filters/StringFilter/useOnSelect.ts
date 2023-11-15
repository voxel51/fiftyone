import { isObjectIdField } from "@fiftyone/state";
import { useRef } from "react";
import { RecoilState, useRecoilCallback } from "recoil";
import { stringSearchResults } from "./state";

export default function (
  modal: boolean,
  path: string,
  selectedAtom: RecoilState<(string | null)[]>
) {
  const selectedMap = useRef<Map<string | null, number | null>>(new Map());
  return {
    onSelect: useRecoilCallback(
      ({ snapshot, set }) =>
        async (value: string) => {
          const objectId = await snapshot.getPromise(isObjectIdField(path));
          const results = objectId
            ? null
            : await snapshot.getPromise(stringSearchResults({ path, modal }));
          const found = results?.values
            ?.map(({ value: v }) => String(v))
            .indexOf(value);

          const selected = new Set(await snapshot.getPromise(selectedAtom));
          selectedMap.current.set(
            value,
            found !== undefined && found >= 0
              ? results?.values[found].count || null
              : null
          );
          selected.add(value);
          set(selectedAtom, [...selected].sort());

          return "";
        },
      [modal, path, selectedAtom, selectedMap]
    ),
    selectedMap,
  };
}
