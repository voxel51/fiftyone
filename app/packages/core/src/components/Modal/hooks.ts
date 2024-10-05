import * as fos from "@fiftyone/state";
import { useHelpPanel, useJSONPanel } from "@fiftyone/state";
import { useCallback, useContext } from "react";
import { useRecoilCallback } from "recoil";
import { modalContext } from "./modal-context";

export const useLookerHelpers = () => {
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

export const useLookerOptionsUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (update: object, updater?: (updated: {}) => void) => {
        const currentOptions = await snapshot.getPromise(
          fos.savedLookerOptions
        );

        const panels = await snapshot.getPromise(fos.lookerPanels);
        const updated = {
          ...currentOptions,
          ...update,
          showJSON: panels.json.isOpen,
          showHelp: panels.help.isOpen,
        };
        set(fos.savedLookerOptions, updated);
        if (updater) updater(updated);
      }
  );
};

export const useInitializeImaVidSubscriptions = () => {
  const subscribeToImaVidStateChanges = useRecoilCallback(
    ({ set }) =>
      () => {
        // note: resetRecoilState is not triggering `onSet` in effect,
        // see https://github.com/facebookexperimental/Recoil/issues/2183
        // replace with `useResetRecoilState` when fixed

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

export const useModalContext = () => {
  const ctx = useContext(modalContext);

  if (typeof ctx === "undefined") {
    throw new Error("modal context is not defined");
  }

  return ctx;
};
