import { useSpaces } from "@fiftyone/spaces";
import { sessionSpaces } from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";

const id = "primary";
const defaultState = {
  id: "root",
  children: [
    {
      id: "default-samples-node",
      children: [],
      type: "Samples",
      pinned: true,
    },
  ],
  type: "panel-container",
  activeChild: "default-samples-node",
};

export default function usePrimarySpaces() {
  const { spaces, updateSpaces } = useSpaces(id, defaultState);
  const sessionSpacesState = useRecoilValue(sessionSpaces);

  useEffect(() => {
    console.log(sessionSpacesState);
    // updateSpaces(sessionSpaces);
  }, [updateSpaces, sessionSpacesState]);

  return { id, spaces, updateSpaces };
}
