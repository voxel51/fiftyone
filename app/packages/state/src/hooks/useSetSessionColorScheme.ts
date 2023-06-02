import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import {
  ColorScheme,
  dataset,
  datasetAppConfig,
  datasetName,
  sessionColorScheme,
  stateSubscription,
  view,
} from "../recoil";
import { DEFAULT_APP_COLOR_SCHEME } from "../utils";
import useSendEvent from "./useSendEvent";

const useSetSessionColorScheme = () => {
  const send = useSendEvent(true);
  const [commit] = useMutation<foq.setColorSchemeMutation>(foq.setColorScheme);
  const onError = useErrorHandler();
  const update = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (saveToApp: boolean, setting: ColorScheme) => {
        set(sessionColorScheme, setting);
        if (saveToApp) {
          set(dataset, (current) => {
            return {
              ...current,
              appConfig: {
                ...current.appConfig,
                colorScheme: {
                  colorPool: setting.colorPool,
                  fields: setting.fields,
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
      async (saveToApp: boolean, colorScheme: ColorScheme) => {
        // when clear default, we reset to app default;
        // when reset, we reset to appConfig default (if exisits) or app default.
        const defaultSetting = (await snapshot.getPromise(datasetAppConfig))
          .colorScheme;

        const combined = {
          colorPool:
            defaultSetting && !saveToApp
              ? defaultSetting.colorPool
              : DEFAULT_APP_COLOR_SCHEME.colorPool,
          fields:
            defaultSetting?.fields && !saveToApp
              ? defaultSetting.fields
              : DEFAULT_APP_COLOR_SCHEME.fields,
        };

        if (colorScheme == null) {
          colorScheme = combined;
        }

        return send(async (session) => {
          commit({
            onError,
            onCompleted: () => update(saveToApp, colorScheme),
            variables: {
              subscription: await snapshot.getPromise(stateSubscription),
              session,
              dataset: await snapshot.getPromise(datasetName),
              stages: await snapshot.getPromise(view),
              colorScheme: colorScheme,
              saveToApp: saveToApp,
            },
          });
        });
      },
    [commit, onError, send, update]
  );
};

export default useSetSessionColorScheme;
