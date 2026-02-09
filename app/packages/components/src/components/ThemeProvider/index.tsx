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
          active: "#4D4D4D",
          disabled: "#353535",
        },
        background: {
          body: "#D9D9D9",
          button: "#E6E6E6",
          header: "#FFFFFF",
          input: "#FAFAFA",
          level1: "#F2F2F2",
          level2: "#FAFAFA",
          level3: "#F2F2F2",
          looker: "#F2F2F2",
          mediaSpace: "#FAFAFA",
          mediaSpaceTransparent: "rgba(250, 250, 250, 0)",
          modalBackdrop: "rgba(0, 0, 0, 0.5)",
          sidebar: "#FAFAFA",
          tooltip: "#FFFFFF",
          viewBarButtons: "#FFFFFF",
          inactiveTab: "#E6E6E6",
          popup: "#F2F2F2",
          field: "#F2F2F2",
          activeCell: "#F2F2F2",
        },
        divider: "#CCCCCC",
        dividerDisabled: "#D9D9D9",
        danger: {
          plainColor: "#E00F0F",
        },
        grey: {
          400: "#fff",
          5: "#0D0D0D",
        },
        neutral: {
          plainColor: "#0057F0",
          softBg: "rgba(242, 242, 242, 0.3)",
          softBorder: "#BFBFBF",
        },
        primary: {
          main: "#FF6D04",
          mainChannel: "0 0 0",
          plainBorder: "#E6E6E6",
          plainColor: "#FF6D04",
          softBg: "rgba(217, 217, 217, 0.7)",
          softBorder: "#CCCCCC",
        },
        secondary: {
          main: "#4D4D4D",
        },
        tertiary: {
          main: "#E6E6E6",
          hover: "#D9D9D9",
        },
        focusVisible: "rgba(6, 136, 255, 0.3)",
        text: {
          buttonHighlight: "#FFFFFF",
          primary: "#000000",
          secondary: "#4D4D4D",
          tertiary: "#808080",
          lookerTag: "#FFFFFF",
          invert: "#FFFFFF",
        },
        custom: {
          shadow: "#E6E6E6",
          shadowDark: "#B3B3B3",
          lightning: "#FF6D04",
          toastBackgroundColor: "#FFFFFF",
          primarySoft: "#FF6D04",
        },
        voxel: {
          500: "#FF6D04",
          600: "#D54B00", // Not in the design. Darker shade of 500 of is used
        },
        error: {
          main: "#FC1111",
        },
        Avatar: {
          defaultBg: "#D9D9D9",
        },
      },
    },
    dark: {
      palette: {
        themeMode: "dark",
        action: {
          active: "#B3B3B3",
          disabled: "#808080",
        },
        background: {
          button: "#333333",
          header: "#262626",
          body: "#262626",
          looker: "#1A1A1A",
          level1: "#333333",
          level2: "#1A1A1A",
          level3: "#0D0D0D",
          mediaSpace: "#1A1A1A",
          mediaSpaceTransparent: "rgba(26, 26, 26, 0)",
          modalBackdrop: "rgba(0, 0, 0, 0.75)",
          sidebar: "#1A1A1A",
          tooltip: "#0D0D0D",
          viewBarButtons: "#262626",
          inactiveTab: "#2E2E2E",
          paper: "#1A1A1A",
          popup: "#333333",
          field: "rgba(51, 51, 51, 0.3)",
          activeCell: "#404040",
          card: "#292929",
        },
        divider: "#333333",
        dividerDisabled: "#262626",
        danger: {
          plainColor: "#FC1111",
        },
        grey: {
          400: "#fff",
          5: "#0D0D0D",
        },
        neutral: {
          softBg: "rgba(51, 51, 51, 0.3)",
          softBorder: "#404040",
          plainColor: "#0064FF",
        },
        primary: {
          main: "#FF6D04",
          mainChannel: "0 0 0",
          plainColor: "#FF6D04",
          plainBorder: "#0D0D0D",
          softBg: "#404040",
          softBorder: "#333333",
        },
        secondary: {
          main: "#B3B3B3",
        },
        tertiary: {
          main: "#262626",
          hover: "#333333",
        },
        focusVisible: "rgba(3, 82, 206, 0.3)",
        text: {
          primary: "#FFFFFF",
          secondary: "#B3B3B3",
          tertiary: "#808080",
          buttonHighlight: "#FFFFFF",
          lookerTag: "#FFFFFF",
          invert: "#0D0D0D",
        },
        custom: {
          shadow: "#1A1A1A",
          shadowDark: "#000000",
          lightning: "#f5b700",
          toastBackgroundColor: "#333",
          primarySoft: "#FFCC99",
          primaryMedium: "#FFB56A",
        },
        voxel: {
          500: "#FF6D04",
          600: "#D54B00", // Not in the design. Darker shade of 500 of is used
        },
        error: {
          main: "#FC1111",
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

  // Sync dark class on document element for design-system components
  React.useEffect(() => {
    if (current === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [current]);

  return (
    <LegacyTheme.Provider value={theme.colorSchemes[current].palette}>
      <CssVarsProvider theme={theme} defaultMode={current}>
        {children}
      </CssVarsProvider>
    </LegacyTheme.Provider>
  );
};

export default ThemeProvider;
