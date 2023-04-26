import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue, useSetRecoilState } from "recoil";
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
  const setSessionColorSchemeState = useSetRecoilState(sessionColorScheme);

  function setColorScheme(
    colors: string[],
    customizedColorSettings: CustomizeColor[]
  ) {
    const combined = {
      colorPool: colors,
      customizedColorSettings: customizedColorSettings,
    };

    setSessionColorSchemeState(combined);

    return send((session) =>
      commit({
        onError,
        variables: {
          subscription,
          session,
          colorScheme: combined,
          saveToApp: false,
        },
      })
    );
  }
  return setColorScheme;
};

export default useSessionColorScheme;
