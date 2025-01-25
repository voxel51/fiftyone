import { useEnv } from "../common";
import {
  FIFTYONE_APP_BANNER_COLOR_ENV_KEY,
  FIFTYONE_APP_BANNER_TEXT_ENV_KEY,
  FIFTYONE_APP_BANNER_TEXT_COLOR_ENV_KEY,
} from "@fiftyone/teams-state/src/constants";

export default function useStaticBannerInfo() {
  const notifications = [];
  const staticBannerText: string = useEnv(FIFTYONE_APP_BANNER_TEXT_ENV_KEY);
  const staticBannerColor: string = useEnv(FIFTYONE_APP_BANNER_COLOR_ENV_KEY);
  const staticBannerTextColor: string = useEnv(
    FIFTYONE_APP_BANNER_TEXT_COLOR_ENV_KEY
  );

  if (staticBannerText && staticBannerColor && staticBannerTextColor) {
    notifications.push({
      code: "STATIC_BANNER",
      kind: "GLOBAL",
      title: staticBannerText,
      overrideBgColor: staticBannerColor,
      overrideTextColor: staticBannerTextColor,
    });
  }

  return notifications;
}
