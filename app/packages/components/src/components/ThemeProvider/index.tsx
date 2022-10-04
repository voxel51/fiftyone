import React from "react";
import * as fos from "@fiftyone/state";
import { extendTheme as extendJoyTheme } from "@mui/joy/styles";
import { Experimental_CssVarsProvider as CssVarsProvider } from "@mui/material/styles";
import { useRecoilValue } from "recoil";
import { ThemeContext as LegacyTheme } from "styled-components";

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

export const darkTheme = {
  background: grey19,
  backgroundDark: grey15,
  backgroundDarker: grey11,
  backgroundLight: grey24,
  backgroundLightBorder: grey15,
  backgroundDarkBorder: grey11,
  backgroundTransparent: "hsl(200, 0%, 15%, 0.7)",
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

const theme = extendJoyTheme({
  colorSchemes: {
    light: {
      palette: {
        background: {
          body: "#F6F8FA",
          level1: "#FFF",
          level2: "#FFF",
          level3: "#FFF",
        },
        neutral: {
          softBg: "rgba(27, 31, 36, 0.15)",
          softBorder: "#F3F4F6",
          plainColor: blue53,
        },
        primary: {
          plainColor: "rgba(27, 31, 36, 0.15)",
          plainBorder: "rgba(27, 31, 36, 0.15)",
          softBg: "rgba(27, 31, 36, 0.15)",
          softBorder: "rgba(27, 31, 36, 0.15)",
        },
        focusVisible: "rgba(3, 102, 214, 0.3)",
        divider: "#EAECF0",
        danger: {
          plainColor: red,
        },
        text: {
          primary: "#000",
          secondary: "#000",
          tertiary: "rgba(27, 31, 36, 0.15)",
        },
      },
    },
    dark: {
      palette: {
        background: {
          body: "hsl(200, 0%, 15%)",
          level1: "hsl(200, 0%, 20%)",
          level2: "hsl(200, 0%, 10%)",
          level3: "hsl(200, 0%, 5%)",
          tooltip: "hsl(200, 0%, 5%)",
        },
        divider: "hsl(200, 0%, 20%)",
        danger: {
          plainColor: red,
        },
        neutral: {
          softBg: "hsl(200, 0%, 20%, 0.3)",
          softBorder: "hsl(200, 0%, 25%)",
          plainColor: blue53,
        },
        primary: {
          plainColor: "hsl(25, 100%, 51%)",
          plainBorder: "hsl(200, 0%, 5%)",
          softBg: "hsl(200, 0%, 15%, 0.7)",
          softBorder: "hsl(200, 0%, 20%)",
        },
        focusVisible: "rgba(3, 102, 214, 0.3)",
        text: {
          primary: "hsl(200, 0%, 100%)",
          secondary: "hsl(200, 0%, 70%)",
          tertiary: "hsl(200, 0%, 50%)",
        },
      },
    },
  },
  fontFamily: {
    body: "Palanquin, sans-serif",
  },
});

export const useTheme = () => {
  return theme.colorSchemes[useRecoilValue(fos.theme)].palette;
};

const ThemeProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const current = useRecoilValue(fos.theme);

  return (
    <LegacyTheme.Provider value={theme.colorSchemes[current].palette}>
      <CssVarsProvider theme={theme} defaultMode={current}>
        {children}
      </CssVarsProvider>
    </LegacyTheme.Provider>
  );
};

export default ThemeProvider;
