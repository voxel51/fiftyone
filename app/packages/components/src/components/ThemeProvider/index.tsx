import React from "react";
import * as fos from "@fiftyone/state";
import { extendTheme as extendJoyTheme, Theme } from "@mui/joy/styles";
import {
  createTheme,
  Experimental_CssVarsProvider as CssVarsProvider,
} from "@mui/material/styles";
import { useRecoilValue } from "recoil";
import { ThemeContext as LegacyTheme } from "styled-components";

let theme = extendJoyTheme({
  colorSchemes: {
    light: createTheme({
      palette: {
        background: {
          body: "hsl(200, 0%, 85%)",
          button: "hsl(200, 0%, 90%)",
          header: "hsl(200, 0%, 100%)",
          input: "hsl(200, 0%, 98%)",
          level1: "hsl(200, 0%, 95%)",
          level2: "hsl(200, 0%, 98%)",
          level3: "hsl(200, 0%, 95%)",
          looker: "hsl(200, 0%, 95%)",
          mediaSpace: "hsl(200,0%,98%)",
          mediaSpaceTransparent: "hsla(200,0%,98%,0)",
          modalBackdrop: "hsl(200, 0%, 0%, 0.5)",
          sidebar: "hsl(200, 0%, 100%)",
          tooltip: "hsl(200, 0%, 100%)",
          viewBarButtons: "hsl(200, 0%, 100%)",
          inactiveTab: "hsl(200, 0%, 90%)",
        },
        divider: "hsl(200, 0%, 80%)",
        danger: {
          plainColor: "hsl(0, 87%, 47%)",
        },
        grey: {
          400: "#fff",
          5: "hsl(200, 0%, 5%)",
        },
        neutral: {
          plainColor: "hsl(213, 100%, 47%)",
          softBg: "hsl(200, 0%, 95%, 0.3)",
          softBorder: "hsl(200, 0%, 75%)",
        },
        primary: {
          main: "hsl(25, 100%, 51%)",
          plainBorder: "hsl(200, 0%, 90%)",
          plainColor: "hsl(25, 100%, 51%)",
          softBg: "hsl(200, 0%, 85%, 0.7)",
          softBorder: "hsl(200, 0%, 80%)",
        },
        focusVisible: "hsl(212, 97%, 57%, 0.3)",
        text: {
          buttonHighlight: "hsl(200, 0%, 100%)",
          primary: "hsl(200, 0%, 0%)",
          secondary: "hsl(200, 0%, 30%)",
          tertiary: "hsl(200, 0%, 50%)",
          lookerTag: "hsl(200, 0%, 100%)",
          invert: "hsl(200, 0%, 100%)",
        },
        custom: {
          shadow: "hsl(200, 0%, 90%)",
          shadowDark: "hsl(200, 0%, 70%)",
        },
        voxel: {
          500: "#FF6D04",
          600: "#D54B00", // Not in the design. Darker shade of 500 of is used
        },
      },
    }),
    dark: createTheme({
      palette: {
        background: {
          button: "hsl(200, 0%, 20%)",
          header: "hsl(200, 0%, 15%)",
          body: "hsl(200, 0%, 15%)",
          looker: "hsl(200, 0%, 10%)",
          level1: "hsl(200, 0%, 20%)",
          level2: "hsl(200, 0%, 10%)",
          level3: "hsl(200, 0%, 5%)",
          mediaSpace: "hsl(200, 0%, 10%)",
          mediaSpaceTransparent: "hsla(200, 0%, 10%,0)",
          modalBackdrop: "hsl(200, 0%, 0%, 0.75)",
          sidebar: "hsl(200, 0%, 15%)",
          tooltip: "hsl(200, 0%, 5%)",
          viewBarButtons: "hsl(200, 0%, 15%)",
          inactiveTab: "hsl(200, 0%, 18%)",
        },
        divider: "hsl(200, 0%, 20%)",
        danger: {
          plainColor: "hsl(0, 87%, 53%)",
        },
        grey: {
          400: "#fff",
          5: "hsl(200, 0%, 5%)",
        },
        neutral: {
          softBg: "hsl(200, 0%, 20%, 0.3)",
          softBorder: "hsl(200, 0%, 25%)",
          plainColor: "hsl(213, 100%, 53%)",
        },
        primary: {
          main: "hsl(25, 100%, 51%)",
          mainChannel: "none",
          plainColor: "hsl(25, 100%, 51%)",
          plainBorder: "hsl(200, 0%, 5%)",
          softBg: "hsl(200, 0%, 25%)",
          softBorder: "hsl(200, 0%, 20%)",
        },
        secondary: {
          main: "hsl(200, 0%, 70%)",
        },
        focusVisible: "hsl(212, 97%, 43%, 0.3)",
        text: {
          primary: "hsl(200, 0%, 100%)",
          secondary: "hsl(200, 0%, 70%)",
          tertiary: "hsl(200, 0%, 50%)",
          buttonHighlight: "hsl(200, 0%, 100%)",
          lookerTag: "hsl(200, 0%, 100%)",
          invert: "hsl(200, 0%, 5%)",
        },
        custom: {
          shadow: "hsl(200, 0%, 10%)",
          shadowDark: "hsl(200, 0%, 0%)",
        },
        voxel: {
          500: "#FF6D04",
          600: "#D54B00", // Not in the design. Darker shade of 500 of is used
        },
      },
    }),
  },
  fontFamily: {
    body: "Palanquin, sans-serif",
  },
});

export const useTheme = () => {
  return theme.colorSchemes[useRecoilValue(fos.theme)].palette;
};

const ThemeProvider: React.FC<
  React.PropsWithChildren<{ customTheme?: Theme }>
> = ({ children, customTheme }) => {
  if (customTheme) theme = customTheme;
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
