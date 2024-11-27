import { appEnvs } from "@fiftyone/teams-state";
import { APP_THEME_ENV_KEY } from "@fiftyone/teams-state/src/constants";
import { useEffect, useState } from "react";
import { useSetRecoilState } from "recoil";
import useInitializeTheme from "./useInitializeTheme";
import useSessionRefresher from "./useSessionRefresher";

export default function useInitializeApp(props) {
  const { pageProps } = props;
  const initializeTheme = useInitializeTheme();
  const [ready, setReady] = useState(false);
  const setAppEnvs = useSetRecoilState(appEnvs);
  useSessionRefresher();

  const { envs = {} } = pageProps;

  useEffect(() => {
    setAppEnvs(envs);
    initializeTheme(envs[APP_THEME_ENV_KEY]);
    setReady(true);
  }, []);

  return ready;
}
