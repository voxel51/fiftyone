import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue, useSetRecoilState } from "recoil";
import {
  stateSubscription,
  sessionColorScheme,
  datasetName,
  view,
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

  function setColorScheme() {
    const combined = {
      colorPool: DEFAULT_APP_COLOR_SCHEME.colorPool,
      customizedColorSettings: DEFAULT_APP_COLOR_SCHEME.customizedColorSettings,
    };
    const toSave = {
      colorPool: DEFAULT_APP_COLOR_SCHEME.colorPool,
      customizedColorSettings: JSON.stringify(
        DEFAULT_APP_COLOR_SCHEME.customizedColorSettings
      ),
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
          saveToApp: true,
          colorSchemeSaveFormat: toSave,
        },
      })
    );
  }
  return setColorScheme;
};

export default useClearSessionColorScheme;
