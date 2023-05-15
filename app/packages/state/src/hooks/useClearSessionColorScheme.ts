import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import {
  dataset,
  datasetAppConfig,
  datasetName,
  sessionColorScheme,
  stateSubscription,
  view,
} from "../recoil";
import { DEFAULT_APP_COLOR_SCHEME } from "../utils";
import useSendEvent from "./useSendEvent";

const useClearSessionColorScheme = () => {
  const send = useSendEvent(true);
  const [commit] = useMutation<foq.setColorSchemeMutation>(foq.setColorScheme);
  const onError = useErrorHandler();
  const update = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (saveToApp: boolean, setting: any) => {
        set(sessionColorScheme, setting);
        if (saveToApp) {
          set(dataset, (current) => {
            return {
              ...current,
              appConfig: {
                ...current.appConfig,
                colorScheme: {
                  colorPool: setting.colorPool,
                  customizedColorSettings: JSON.stringify(
                    setting.customizedColorSettings
                  ),
                },
              },
            };
          });
        }
      },
    []
  );

  return useRecoilCallback(
    ({ snapshot }) =>
      async (saveToApp: boolean) => {
        // when clear default, we reset to app default;
        // when reset, we reset to appConfig default (if exisits) or app default.
        const defaultSetting = (await snapshot.getPromise(datasetAppConfig))
          .colorScheme;

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

        return send(async (session) => {
          commit({
            onError,
            onCompleted: () => update(saveToApp, combined),
            variables: {
              subscription: await snapshot.getPromise(stateSubscription),
              session,
              dataset: await snapshot.getPromise(datasetName),
              stages: await snapshot.getPromise(view),
              colorScheme: combined,
              saveToApp: saveToApp,
              colorSchemeSaveFormat: api,
            },
          });
        });
      },
    [commit, onError, send, update]
  );
};

export default useClearSessionColorScheme;
