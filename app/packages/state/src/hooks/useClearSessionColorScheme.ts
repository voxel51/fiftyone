import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue, useSetRecoilState } from "recoil";
import {
  stateSubscription,
  sessionColorScheme,
  datasetName,
  view,
  datasetAppConfig,
} from "../recoil";
import useSendEvent from "./useSendEvent";
import { DEFAULT_APP_COLOR_SCHEME } from "../utils";

const useClearSessionColorScheme = () => {
  const send = useSendEvent(true);
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setColorSchemeMutation>(foq.setColorScheme);
  const onError = useErrorHandler();
  const setSessionColorSchemeState = useSetRecoilState(sessionColorScheme);
  const dataset = useRecoilValue(datasetName);
  const stages = useRecoilValue(view);
  const defaultSetting = useRecoilValue(datasetAppConfig).colorScheme;

  function onClear(saveToApp: boolean) {
    // when clear default, we reset to app default;
    // when reset, we reset to appConfig default (if exisits) or app default.
    const combined = {
      colorPool:
        defaultSetting && !saveToApp
          ? defaultSetting.colorPool
          : DEFAULT_APP_COLOR_SCHEME.colorPool,
      customizedColorSettings:
        defaultSetting?.customizedColorSettings && !saveToApp
          ? JSON.parse(defaultSetting.customizedColorSettings)
          : DEFAULT_APP_COLOR_SCHEME.customizedColorSettings,
    };
    const api = {
      colorPool:
        defaultSetting && !saveToApp
          ? defaultSetting.colorPool
          : DEFAULT_APP_COLOR_SCHEME.colorPool,
      customizedColorSettings:
        defaultSetting?.customizedColorSettings && !saveToApp
          ? defaultSetting.customizedColorSettings
          : null,
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
          colorSchemeSaveFormat: api,
        },
      })
    );
  }
  return onClear;
};

export default useClearSessionColorScheme;
