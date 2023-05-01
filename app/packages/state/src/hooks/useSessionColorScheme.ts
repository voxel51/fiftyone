import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import {
  stateSubscription,
  CustomizeColor,
  sessionColorScheme,
  datasetName,
  view,
} from "../recoil";
import useSendEvent from "./useSendEvent";

const useSessionColorScheme = () => {
  const send = useSendEvent(true);
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setColorSchemeMutation>(foq.setColorScheme);
  const onError = useErrorHandler();
  const [computedSessionColorScheme, setSessionColorSchemeState] =
    useRecoilState(sessionColorScheme);
  const dataset = useRecoilValue(datasetName);
  const stages = useRecoilValue(view);

  function setColorScheme(
    colorPool: string[],
    customizedColorSettings: CustomizeColor[],
    saveToApp: boolean = false
  ) {
    const combined = {
      colorPool,
      customizedColorSettings,
    };

    const saveFormat = {
      colorPool,
      customizedColorSettings: JSON.stringify(customizedColorSettings),
    };

    setSessionColorSchemeState(combined);

    return send((session) =>
      commit({
        onError,
        variables: {
          subscription,
          session,
          dataset,
          stages,
          colorScheme: combined,
          saveToApp: saveToApp,
          colorSchemeSaveFormat: saveFormat,
        },
      })
    );
  }

  const [opacity, setOpacity] = useRecoilState(fos.alpha(false));
  const [colorBy, setColorBy] = useRecoilState(
    fos.appConfigOption({ key: "colorBy", modal: false })
  );
  const [useMulticolorKeypoints, setUseMultiplecolorKeypoints] = useRecoilState(
    fos.appConfigOption({ key: "multicolorKeypoints", modal: false })
  );
  const [showSkeleton, setShowSkeleton] = useRecoilState(
    fos.appConfigOption({ key: "showSkeletons", modal: false })
  );

  const props = {
    opacity,
    colorBy: colorBy as "field" | "value",
    useMulticolorKeypoints: useMulticolorKeypoints as Boolean,
    showSkeleton: showSkeleton as Boolean,
    setOpacity,
    setColorBy,
    setUseMultiplecolorKeypoints,
    setShowSkeleton,
  };

  return { setColorScheme, props, computedSessionColorScheme };
};

export default useSessionColorScheme;
