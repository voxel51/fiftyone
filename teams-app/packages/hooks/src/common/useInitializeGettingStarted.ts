import { FIFTYONE_APP_GET_STARTED_DISABLED_PATHS_ENV_KEY } from "@fiftyone/teams-state/src/constants";

export default function useInitializeGettingStarted(envs) {
  const getStartedDisabledPaths =
    envs?.[FIFTYONE_APP_GET_STARTED_DISABLED_PATHS_ENV_KEY];
  if (typeof getStartedDisabledPaths !== "string") return;
  const paths = getStartedDisabledPaths.split(",");
  for (const path of paths) {
    if (window.location.pathname.includes(path)) {
      sessionStorage.setItem("teamsGettingStartedShown", "true");
    }
  }
}
