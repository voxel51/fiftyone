import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  stateSubscription,
  CustomizeColor,
  sessionColorScheme,
} from "../recoil";
import useSendEvent from "./useSendEvent";

const useSessionColorScheme = () => {
  const send = useSendEvent(true);
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setColorSchemeMutation>(foq.setColorScheme);
  const onError = useErrorHandler();
  const [sessionColorSchemeState, setSessionColorSchemeState] =
    useRecoilState(sessionColorScheme);
  const { colorPool, customizedColors } = sessionColorSchemeState;

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
      customizedColorSettings: customizedColors,
    };

    setSessionColorSchemeState(combined);
    console.info("toAPI", toAPI);
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
  return [colorPool, customizedColors, setColorScheme] as any[];
};

export default useSessionColorScheme;
