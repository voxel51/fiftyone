import * as foq from "@fiftyone/relay";
import { useMemo } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  stateSubscription,
  CustomizeColor,
  sessionColorScheme,
} from "../recoil";
import useSendEvent from "./useSendEvent";

const useColorScheme = () => {
  const send = useSendEvent(true);
  const subscription = useRecoilValue(stateSubscription);
  const [sessionColorSchemeState, setSessionColorSchemeState] =
    useRecoilState(sessionColorScheme);
  const [commit] = useMutation<setColorSchemeMutation>(setColorScheme);
  const onError = useErrorHandler();

  function setColorScheme(
    colors: string[],
    customizedColors: CustomizeColor[]
  ) {
    const combined = {
      colorPool: colors,
      customizedColors: customizedColors,
    };
    const toAPI = {
      colorPool: colors,
      customizedColors: JSON.stringify(customizedColors),
    };

    setSessionColorSchemeState(combined);

    return send((session) =>
      commit({
        onError,
        variables: {
          subscription,
          session,
          colorScheme: toAPI,
          saveToApp: false,
        },
      })
    );
  }

  const { colorPool, customizedColors } = sessionColorSchemeState;

  return [colorPool, customizedColors, setColorScheme];
};

export default useColorScheme;
