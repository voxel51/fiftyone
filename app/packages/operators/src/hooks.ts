import { useEffect, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { isEqual } from "lodash";
import {
  ExecutionContext,
  fetchRemotePlacements,
  resolveLocalPlacements,
} from "./operators";
import { operatorPlacementsAtom, operatorThrottledContext } from "./state";

export function useOperatorPlacementsResolver() {
  const context = useRecoilValue(operatorThrottledContext);
  const setOperatorPlacementsAtom = useSetRecoilState(operatorPlacementsAtom);
  const [resolving, setResolving] = useState(false);
  const lastContext = useRef(null);

  useEffect(() => {
    async function updateOperatorPlacementsAtom() {
      setResolving(true);
      try {
        const ctx = new ExecutionContext({}, context);
        const remotePlacements = await fetchRemotePlacements(ctx);
        const localPlacements = await resolveLocalPlacements(ctx);
        const placements = [...remotePlacements, ...localPlacements];
        setOperatorPlacementsAtom(placements);
      } catch (error) {
        console.error(error);
      }
      setResolving(false);
    }
    if (!isEqual(lastContext.current, context) && context?.datasetName) {
      lastContext.current = context;
      updateOperatorPlacementsAtom();
    }
  }, [context, setOperatorPlacementsAtom]);

  return { resolving };
}
