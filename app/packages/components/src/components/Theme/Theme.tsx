import React from "react";
import { atom, useRecoilValue } from "recoil";

import { toSnakeCase } from "@fiftyone/utilities";
import { useLayoutEffect } from "react";

const white100 = "hsl(0, 0%, 100%)";
const grey11 = "hsl(210, 11%, 11%)";
const grey15 = "hsl(210, 11%, 15%)";
const grey19 = "hsl(214, 7%, 19%)";
const grey19a70 = "hsla(214, 7%, 19%, 0.7)";
const grey24 = "hsl(210, 5%, 24%)";
const grey37 = "hsl(200, 2%, 37%)";
const grey60 = "hsl(230, 3%, 60%)";
const grey68 = "hsl(220, 2%, 68%)";

const orange49 = "hsl(27, 95%, 49%)";
const orange45 = "hsl(27, 95%, 45%)";
const orange49a0 = "hsla(27, 95%, 49%, 0)";
const orange49a10 = "hsla(27, 95%, 49%, 0.1)";
const orange49a40 = "hsla(27, 95%, 49%, 0.4)";

const blue53 = "hsl(213, 100%, 53%)";
const blue92 = "hsl(211, 85%, 92%)";

const red = "hsl(0, 87%, 53%)";

export interface ColorTheme {
  background: string;
  backgroundDark: string;
  backgroundDarker: string;
  backgroundLight: string;
  backgroundLightBorder: string;
  backgroundDarkBorder: string;
  backgroundTransparent: string;
  border: string;
  borderLight: string;

  button: string;
  buttonBorder: string;

  brand: string;
  brandDark: string;
  brandTransparent: string;
  brandMoreTransparent: string;
  brandFullyTransparent: string;

  font: string;
  fontDark: string;
  fontDarkest: string;

  secondary: string;
  secondaryLight: string;

  error: string;
}

export const darkTheme: ColorTheme = {
  background: grey19,
  backgroundDark: grey15,
  backgroundDarker: grey11,
  backgroundLight: grey24,
  backgroundLightBorder: grey15,
  backgroundDarkBorder: grey11,
  backgroundTransparent: grey19a70,
  border: grey37,
  borderLight: grey24,

  button: grey37,
  buttonBorder: grey24,

  brand: orange49,
  brandDark: orange45,
  brandTransparent: orange49a40,
  brandMoreTransparent: orange49a10,
  brandFullyTransparent: orange49a0,

  font: white100,
  fontDark: grey68,
  fontDarkest: grey60,

  secondary: blue53,
  secondaryLight: blue92,

  error: red,
};

export const Theme = atom<ColorTheme>({
  key: "Theme",
  default: darkTheme,
});

export const useTheme = () => {
  return useRecoilValue(Theme);
};

const useThemeContext = () => {
  const theme = useTheme();

  useLayoutEffect(() => {
    const snake = toSnakeCase(theme);
    for (const key in snake) {
      document.documentElement.style.setProperty(
        `--${key.replace(/_/g, "-")}`,
        snake[key]
      );
    }
  }, [theme]);
};

const ThemeContext: React.FC = ({ children }) => {
  useThemeContext();

  return <>{children}</>;
};

export default ThemeContext;
