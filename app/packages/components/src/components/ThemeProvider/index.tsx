import React, { useContext, useLayoutEffect } from "react";
import * as fos from "@fiftyone/state";
import { toSnakeCase } from "@fiftyone/utilities";
import { extendTheme as extendJoyTheme } from "@mui/joy/styles";
import { Experimental_CssVarsProvider as CssVarsProvider } from "@mui/material/styles";
import { useRecoilValue } from "recoil";

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

const dynamicTheme = (accessor: string) => {
  const parts = accessor.split(".");
  parts.unshift("--mui");
  return `var(${parts.join("-")})`;
};

const theme = extendJoyTheme({
  colorSchemes: {
    light: {
      palette: {
        success: {
          solidBg: "#2DA44E",
          solidHoverBg: "#2C974B",
          solidActiveBg: "#298E46",
        },
        neutral: {
          outlinedBg: "#F6F8FA",
          outlinedHoverBg: "#F3F4F6",
          outlinedActiveBg: "rgba(238, 239, 242, 1)",
          outlinedBorder: "rgba(27, 31, 36, 0.15)",
        },
        focusVisible: "rgba(3, 102, 214, 0.3)",
        divider: "#EAECF0",
      },
    },
    dark: {
      palette: {
        divider: "#FFFFFF",
      },
    },
  },
  focus: {
    default: {
      outlineWidth: "3px",
    },
  },
  fontFamily: {
    body: "Palanquin, sans-serif",
    display: "Palanquin, sans-serif",
  },
  typography: {
    body1: {
      fontFamily: "Palanquin, sans-serif",
      fontSize: 16,
      color: "#101828",
    },
  },
  components: {
    JoyInput: {
      styleOverrides: {
        root: {
          border: `1px solid ${dynamicTheme("palette.divider")}`,
        },
        input: {
          "&::placeholder": {
            color: dynamicTheme("palette.text.secondary"),
            fontSize: 14,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
          },
        },
      },
    },
    JoyButton: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: "6px",
          boxShadow: "0 1px 0 0 rgba(27, 31, 35, 0.04)",
          transition: "80ms cubic-bezier(0.33, 1, 0.68, 1)",
          transitionProperty: "color,background-color,box-shadow,border-color",
          ...(ownerState.size === "md" && {
            fontWeight: 600,
            minHeight: "32px",
            fontSize: "14px",
            "--Button-paddingInline": "1rem",
          }),
          ...(ownerState.color === "success" &&
            ownerState.variant === "solid" && {
              "--gh-palette-focusVisible": "rgba(46, 164, 79, 0.4)",
              border: "1px solid rgba(27, 31, 36, 0.15)",
              "&:active": {
                boxShadow: "inset 0px 1px 0px rgba(20, 70, 32, 0.2)",
              },
            }),
          ...(ownerState.color === "neutral" &&
            ownerState.variant === "outlined" && {
              "&:active": {
                boxShadow: "none",
              },
            }),
        }),
      },
    },
  },
});

export const ThemeContext = React.createContext(darkTheme);

export const useTheme = () => {
  return useContext(ThemeContext);
};

const ThemeProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const current = useRecoilValue(fos.theme);
  useLayoutEffect(() => {
    const snake = toSnakeCase(theme);
    for (const key in snake) {
      document.documentElement.style.setProperty(
        `--${key.replace(/_/g, "-")}`,
        snake[key]
      );
    }
  }, [theme]);

  return (
    <CssVarsProvider theme={theme} defaultMode={current}>
      {children}
    </CssVarsProvider>
  );
};

export default ThemeProvider;
