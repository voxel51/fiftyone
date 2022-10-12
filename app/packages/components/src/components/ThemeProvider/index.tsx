import React from "react";
import * as fos from "@fiftyone/state";
import { extendTheme as extendJoyTheme } from "@mui/joy/styles";
import {
  createTheme,
  Experimental_CssVarsProvider as CssVarsProvider,
} from "@mui/material/styles";
import { useRecoilValue } from "recoil";
import { ThemeContext as LegacyTheme } from "styled-components";
import hsl from "hsl-to-hex";

const colors = {
  gray0: hsl(200, 0, 0),
  gray5: hsl(200, 0, 5),
  gray10: hsl(200, 0, 10),
  gray12: hsl(200, 0, 12),
  gray15: hsl(200, 0, 15),
  gray20: hsl(200, 0, 20),
  gray30: hsl(200, 0, 30),
  gray40: hsl(200, 0, 40),
  gray50: hsl(200, 0, 50),
  gray60: hsl(200, 0, 60),
  gray70: hsl(200, 0, 70),
  gray80: hsl(200, 0, 80),
  gray85: hsl(200, 0, 85),
  gray90: hsl(200, 0, 90),
  gray95: hsl(200, 0, 95),
  gray98: hsl(200, 0, 98),
  gray99: hsl(200, 0, 99),
  gray100: hsl(200, 0, 100),
  orange51: hsl(25, 100, 51),
  orange45: hsl(25, 100, 45),
  red0: hsl(0, 75, 20),
  red53: hsl(0, 87, 53),
  blue53: hsl(213, 100, 53),
};

const themes = {
  dark: {
    primaryBg: colors.gray15,
    primaryHoverBg: colors.gray12,
    secondaryBg: colors.gray10,
    primaryText: colors.gray100,
    secondaryText: colors.gray70,
    tertiaryText: colors.gray50,
    primaryButtonBg: colors.orange45,
    primaryButtonHoverBg: colors.orange51,
    linkText: colors.gray100,
    linkHoverText: colors.gray90,
    itemBg: colors.gray20,
    itemText: colors.gray20,
    dividerPrimary: colors.gray20,
    dividerSecondary: colors.gray50,
    shadow: colors.gray5,
    inputBg: colors.gray5,
    inputBorder: colors.gray5,
    inputBorderHover: colors.gray5,
  },
  light: {
    primaryBg: colors.gray100,
    primaryHoverBg: colors.gray95,
    secondaryBg: colors.gray98,
    primaryText: colors.gray0,
    secondaryText: colors.gray40,
    tertiaryText: colors.gray60,
    primaryButtonBg: colors.orange45,
    primaryButtonHoverBg: colors.orange51,
    linkText: colors.gray0,
    linkHoverText: colors.gray10,
    itemBg: colors.gray90,
    itemText: colors.gray80,
    dividerPrimary: colors.gray90,
    dividerSecondary: colors.gray50,
    shadow: colors.gray85,
    inputBg: colors.gray100,
    inputBorder: colors.gray90,
    inputBorderHover: colors.gray80,
  },
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
          plainColor: colors.blue53,
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
          plainColor: colors.red53,
        },
        text: {
          primary: "#000",
          secondary: "#000",
          tertiary: "rgba(27, 31, 36, 0.15)",
        },
      },
    },
    dark: createTheme({
      palette: {
        divider: themes.dark.dividerPrimary,
        primary: {
          main: themes.dark.primaryText,
          plainColor: "hsl(25, 100%, 51%)",
          plainBorder: themes.dark.dividerPrimary,
          softBg: "hsl(200, 0%, 15%, 0.7)",
          softBorder: themes.dark.dividerPrimary,
        },
        background: {
          primary: themes.dark.primaryBg,
          primaryHover: themes.dark.primaryHoverBg,
          secondary: themes.dark.secondaryBg,
          paper: themes.dark.primaryBg,
          item: themes.dark.itemBg,
          input: themes.dark.inputBg,
          body: colors.gray10,
          level1: colors.gray15,
          level2: colors.gray10,
          level3: "hsl(200, 0%, 5%)",
          tooltip: themes.dark.primaryBg,
        },
        secondary: {
          main: themes.dark.secondaryText,
        },
        text: {
          primary: themes.dark.primaryText,
          secondary: themes.dark.secondaryText,
          tertiary: themes.dark.tertiaryText,
        },
        grey: {
          100: "#5c5f60",
        },
        voxel: {
          500: "#FF6D04",
          600: "#D54B00", // Not in the design. Darker shade of 500 of is used
          dangerAlertBg: "#412729", // Not in the design
          dangerAlertBorder: "#764a48", // Not in the design
        },
        custom: {
          shadow: themes.dark.shadow,
          inputBorder: themes.dark.inputBorder,
          inputBorderHover: themes.light.inputBorderHover,
        },
        danger: {
          plainColor: colors.blue53,
        },
        focusVisible: "rgba(3, 102, 214, 0.3)",
        neutral: {
          softBg: "hsl(200, 0%, 20%, 0.3)",
          softBorder: themes.dark.dividerPrimary,
          plainColor: colors.blue53,
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
