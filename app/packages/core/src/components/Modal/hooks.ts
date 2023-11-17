import * as fos from "@fiftyone/state";
import { useHelpPanel, useJSONPanel } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilCallback } from "recoil";

export const usePanels = () => {
  const jsonPanel = useJSONPanel();
  const helpPanel = useHelpPanel();
  const onNavigate = useCallback(() => {
    jsonPanel.close();
    helpPanel.close();
  }, [helpPanel, jsonPanel]);

  return {
    jsonPanel,
    helpPanel,
    onNavigate,
  };
};

export const useInitializeImaVidSubscriptions = () => {
  const subscribeToImaVidStateChanges = useRecoilCallback(
    ({ set }) =>
      () => {
        // note: resetRecoilState is not triggering `onSet` in effect,
        // see https://github.com/facebookexperimental/Recoil/issues/2183
        // replace with `useResetRecoileState` when fixed

        // this setter is to trigger onSet effect that kicks-off the subscription to frame number
        // the supplied random value is placeholder so that the onSet effect is triggered in the atom
        set(fos.imaVidLookerState("currentFrameNumber"), Math.random());
        set(fos.imaVidLookerState("playing"), null);
        set(fos.imaVidLookerState("seeking"), null);
      },
    []
  );

  return { subscribeToImaVidStateChanges };
};
