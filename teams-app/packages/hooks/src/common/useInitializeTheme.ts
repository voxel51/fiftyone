import { MUIThemeModeType } from "@fiftyone/teams-state";
import {
  APP_THEME_INIT_LOCAL_STORAGE_KEY,
  NON_OVERRIDABLE_THEME_PREFIX,
  VALID_THEMES,
} from "@fiftyone/teams-state/src/constants";
import { useColorScheme } from "@mui/material";

export default function useInitializeTheme() {
  const { setMode } = useColorScheme();
  const appThemeInitState = localStorage.getItem(
    APP_THEME_INIT_LOCAL_STORAGE_KEY
  );

  return (theme) => {
    if (typeof theme !== "string") return;
    if (theme.startsWith(NON_OVERRIDABLE_THEME_PREFIX)) {
      const themeMode = theme.replace(NON_OVERRIDABLE_THEME_PREFIX, "");
      if (!VALID_THEMES.includes(themeMode)) return;
      return setMode(themeMode as MUIThemeModeType);
    }
    const expectedInitState = `default-${theme}`;
    if (appThemeInitState === expectedInitState) return;
    setMode(theme as MUIThemeModeType);
    localStorage.setItem(APP_THEME_INIT_LOCAL_STORAGE_KEY, expectedInitState);
  };
}
