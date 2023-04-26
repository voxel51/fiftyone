import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue, useSetRecoilState } from "recoil";
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
  const setSessionColorSchemeState = useSetRecoilState(sessionColorScheme);
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
    console.info(
      subscription,
      dataset,
      stages,
      combined,
      saveFormat,
      saveToApp
    );
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
  return setColorScheme;
};

export default useSessionColorScheme;
