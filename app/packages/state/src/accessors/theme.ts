import { useRecoilValue } from "recoil";
import { theme } from "../recoil";

/** Which palette the App is painting. */
export const useCurrentTheme = (): "dark" | "light" => useRecoilValue(theme);
