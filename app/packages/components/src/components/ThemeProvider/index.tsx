import * as fos from "@fiftyone/state";
import {
  Experimental_CssVarsProvider as CssVarsProvider,
  experimental_extendTheme as extendMuiTheme,
} from "@mui/material/styles";
import React from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { ThemeContext as LegacyTheme } from "styled-components";

function dynamicTheme(accessor: string) {
  const parts = accessor.split(".");
  parts.unshift("--fo");
  return `var(${parts.join("-")})`;
}

let theme = extendMuiTheme({
  cssVarPrefix: "fo",
  typography: {
    fontFamily: "Palanquin, sans-serif",
    button: {
      textTransform: "none",
    },
  },
  zIndex: {
    // Samples modal zIndex is set to 1000
    operatorPalette: 1001,
  },
  colorSchemes: {
    light: {
      palette: {
        themeMode: "light",
        action: {
          active: "hsl(200, 0%, 30%)",
          disabled: "hsl(0, 0.9523809523809558%, 20.588235294117645%)",
        },
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
          sidebar: "hsl(200,0%,98%)",
          tooltip: "hsl(200, 0%, 100%)",
          viewBarButtons: "hsl(200, 0%, 100%)",
          inactiveTab: "hsl(200, 0%, 90%)",
          popup: "hsl(200, 0%, 95%)",
          field: "hsl(200, 0%, 95%)",
          activeCell: "hsl(200, 0%, 95%)",
        },
        divider: "hsl(200, 0%, 80%)",
        dividerDisabled: "hsl(200, 0%, 85%)",
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
          mainChannel: "0 0 0",
          plainBorder: "hsl(200, 0%, 90%)",
          plainColor: "hsl(25, 100%, 51%)",
          softBg: "hsl(200, 0%, 85%, 0.7)",
          softBorder: "hsl(200, 0%, 80%)",
        },
        secondary: {
          main: "hsl(200, 0%, 30%)",
        },
        tertiary: {
          main: "hsl(200, 0%, 90%)",
          hover: "hsl(200, 0%, 85%)",
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
          lightning: "hsl(25, 100%, 51%)",
          toastBackgroundColor: "#FFFFFF",
          primarySoft: "hsl(25, 100%, 51%)",
        },
        voxel: {
          500: "#FF6D04",
          600: "#D54B00", // Not in the design. Darker shade of 500 of is used
        },
        error: {
          main: "hsl(0, 87%, 53%)",
        },
        Avatar: {
          defaultBg: "hsl(200, 0%, 85%)",
        },
      },
    },
    dark: {
      palette: {
        themeMode: "dark",
        action: {
          active: "hsl(200, 0%, 70%)",
          disabled: "hsl(200, 0%, 50%)",
        },
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
          sidebar: "hsl(200, 0%, 10%)",
          tooltip: "hsl(200, 0%, 5%)",
          viewBarButtons: "hsl(200, 0%, 15%)",
          inactiveTab: "hsl(200, 0%, 18%)",
          paper: "hsl(200, 0%, 10%)",
          popup: "hsl(200, 0%, 20%)",
          field: "hsl(200, 0%, 20%, 0.3)",
          activeCell: "hsl(200, 0%, 25%)",
          card: "hsl(200, 0%, 16%)",
        },
        divider: "hsl(200, 0%, 20%)",
        dividerDisabled: "hsl(200, 0%, 15%)",
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
          mainChannel: "0 0 0",
          plainColor: "hsl(25, 100%, 51%)",
          plainBorder: "hsl(200, 0%, 5%)",
          softBg: "hsl(200, 0%, 25%)",
          softBorder: "hsl(200, 0%, 20%)",
        },
        secondary: {
          main: "hsl(200, 0%, 70%)",
        },
        tertiary: {
          main: "hsl(200, 0%, 15%)",
          hover: "hsl(200, 0%, 20%)",
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
          lightning: "#f5b700",
          toastBackgroundColor: "#333",
          primarySoft: "hsl(25, 100%, 80%)",
          primaryMedium: "hsl(25, 100%, 71%)",
        },
        voxel: {
          500: "#FF6D04",
          600: "#D54B00", // Not in the design. Darker shade of 500 of is used
        },
        error: {
          main: "hsl(0, 87%, 53%)",
        },
      },
    },
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiButton: {
      variants: [
        {
          props: { variant: "contained" },
          style: { color: "#ffffff" },
        },
        {
          props: { variant: "outlined", color: "secondary" },
          style: {
            borderColor: dynamicTheme("palette.divider"),
          },
        },
      ],
    },
    MuiModal: {
      styleOverrides: {
        root: {
          // Relative to MuiMenu. Without it, Playwright will not be
          // able to click on Mui-Select component without force=true
          zIndex: 99,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          zIndex: 999,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: dynamicTheme("palette.text.secondary"),
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: dynamicTheme("palette.text.tertiary"),
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: dynamicTheme("palette.text.primary"),
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: dynamicTheme("palette.background.level2"),
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          ".MuiSlider-thumb": {
            transform: "translate(-50%, -50%)",
            top: "50%",
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontSize: "1rem",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${dynamicTheme("palette.divider")}`,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          "fieldset.MuiOutlinedInput-notchedOutline": {
            borderColor: dynamicTheme("palette.divider"),
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
        },
      },
    },
  },

  fontFamily: {
    body: "Palanquin, sans-serif",
  },
  opacity: {
    inputPlaceholder: 0.5,
  },
});

export const useTheme = () => {
  return theme.colorSchemes[useRecoilValue(fos.theme)].palette;
};

export const useFont = () => {
  return theme.typography.fontFamily;
};

const ThemeProvider: React.FC<
  React.PropsWithChildren<{ customTheme?: Theme }>
> = ({ children, customTheme }) => {
  if (customTheme) theme = customTheme;
  const loadable = useRecoilValueLoadable(fos.theme);
  const current = loadable.state === "hasValue" ? loadable.contents : "dark";

  return (
    <LegacyTheme.Provider value={theme.colorSchemes[current].palette}>
      <CssVarsProvider theme={theme} defaultMode={current}>
        {children}
      </CssVarsProvider>
    </LegacyTheme.Provider>
  );
};

export default ThemeProvider;
