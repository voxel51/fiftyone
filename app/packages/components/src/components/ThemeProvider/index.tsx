import * as fos from "@fiftyone/state";
import {
  type CssVarsThemeOptions,
  Experimental_CssVarsProvider as CssVarsProvider,
  experimental_extendTheme as extendMuiTheme,
} from "@mui/material/styles";
import { cssVar } from "@voxel51/voodo";
import { colors } from "@voxel51/voodo/tokens";
import { resolveCssColor } from "@fiftyone/utilities";
import React from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { ThemeContext as LegacyTheme } from "styled-components";

function dynamicTheme(accessor: string) {
  const parts = accessor.split(".");
  parts.unshift("--fo");
  return `var(${parts.join("-")})`;
}

// Every palette value is a Voodo CSS variable, so the legacy `theme.*` and
// `--fo-palette-*` surfaces follow light/dark through Voodo's `.dark` class
// and never carry a literal colour of their own. The two `colorSchemes` are
// therefore identical: the variables flip, the theme does not have to.
//
// MUI cannot lighten/darken/contrast a `var(--…)` value, so every augmented
// colour (primary, secondary, error) supplies main/light/dark/contrastText
// itself, and the `*Channel` tokens MUI would derive are pinned explicitly.
// Anything that parses colours in JS — plotly, canvas, three.js — must go
// through `resolveCssColor` from `@fiftyone/utilities` first.
const c = cssVar.color;

// Figma has no contrast-text token; every filled colour here is a
// mode-independent fill, so white is correct in both themes.
const ON_FILL = "#FFFFFF";

type Mode = "light" | "dark";

/**
 * MUI reads `<key>Channel` ("r g b") for its translucent overlays (hover,
 * selected, focus rings, dividers). It cannot derive them from a `var()`,
 * so each channel is computed from the same Voodo token value the colour
 * itself references, per mode.
 */
const channel = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `${r} ${g} ${b}`;
};

const palette = (mode: Mode) => {
  const t = colors[mode].content;
  const ch = {
    background: channel(t.bg.background),
    textPrimary: channel(t.text.primary),
    textSecondary: channel(t.text.secondary),
    textTertiary: channel(t.text.tertiary),
    divider: channel(t.border.default),
    iconDefault: channel(t.icon.default),
    secondarySurface: channel(t.interactive["secondary-default"]),
    brand: channel(colors.common.brand.primary),
    brandAccent: channel(colors.common.brand.accent),
    brandPressed: channel(t.interactive["primary-pressed"]),
    danger: channel(t.interactive["danger-default"]),
    dangerHover: channel(t.interactive["danger-hover"]),
    dangerPressed: channel(t.interactive["danger-pressed"]),
    onFill: "255 255 255",
  };
  return {
    themeMode: mode,
    action: {
      active: c.icon.default,
      activeChannel: ch.iconDefault,
      disabled: c.icon.disabled,
      hover: c.interactive["secondary-hover"],
      selected: c.interactive["secondary-default"],
      selectedChannel: ch.secondarySurface,
      disabledBackground: c.bg.muted,
      focus: c.focus.ring,
    },
    background: {
      default: c.bg.background,
      defaultChannel: ch.background,
      paper: c.bg.background,
      paperChannel: ch.background,
      body: c.bg.secondary,
      button: c.bg["card-elevated"],
      header: c.bg.card,
      input: c.bg.card,
      level1: c.bg["card-elevated"],
      level2: c.bg.background,
      level3: c.bg.popover,
      looker: c.bg.background,
      mediaSpace: c.bg.background,
      mediaSpaceTransparent: "transparent",
      modalBackdrop: c.scrim.heavy,
      sidebar: c.bg.background,
      tooltip: c.tooltip.bg,
      viewBarButtons: c.bg.card,
      inactiveTab: c.bg.muted,
      popup: c.bg["card-elevated"],
      field: c.bg.muted,
      activeCell: c.interactive["secondary-hover"],
      card: c.bg.card,
    },
    common: {
      background: c.bg.background,
      backgroundChannel: ch.background,
      onBackground: c.text.primary,
      onBackgroundChannel: ch.textPrimary,
    },
    divider: c.border.default,
    dividerChannel: ch.divider,
    dividerDisabled: c.border.disabled,
    danger: {
      plainColor: c.semantic.destructive,
    },
    grey: {
      400: c.text.inverse,
      5: c.bg.popover,
    },
    neutral: {
      plainColor: c.semantic.info,
      softBg: c.bg.muted,
      softBorder: c.border.strong,
    },
    primary: {
      main: c.brand.primary,
      mainChannel: ch.brand,
      light: c.brand.accent,
      lightChannel: ch.brandAccent,
      dark: c.interactive["primary-pressed"],
      darkChannel: ch.brandPressed,
      contrastText: ON_FILL,
      contrastTextChannel: ch.onFill,
      plainColor: c.brand.primary,
      plainBorder: c.border.default,
      softBg: c.interactive["secondary-hover"],
      softBorder: c.border.subtle,
    },
    secondary: {
      main: c.text.secondary,
      mainChannel: ch.textSecondary,
      light: c.text.tertiary,
      lightChannel: ch.textTertiary,
      dark: c.text.primary,
      darkChannel: ch.textPrimary,
      contrastText: c.bg.background,
      contrastTextChannel: ch.background,
    },
    tertiary: {
      main: c.bg.card,
      hover: c.bg["card-elevated"],
    },
    focusVisible: c.focus.ring,
    text: {
      buttonHighlight: ON_FILL,
      primary: c.text.primary,
      primaryChannel: ch.textPrimary,
      secondary: c.text.secondary,
      secondaryChannel: ch.textSecondary,
      tertiary: c.text.tertiary,
      disabled: c.text.placeholder,
      invert: c.text.inverse,
    },
    custom: {
      shadow: c.scrim.light,
      shadowDark: c.scrim.default,
      lightning: c.semantic.warning,
      toastBackgroundColor: c.tooltip.bg,
      primarySoft: c.brand.accent,
      primaryMedium: c.brand.accent,
    },
    voxel: {
      500: c.brand.primary,
      600: c.interactive["primary-pressed"],
    },
    error: {
      main: c.interactive["danger-default"],
      mainChannel: ch.danger,
      light: c.interactive["danger-hover"],
      lightChannel: ch.dangerHover,
      dark: c.interactive["danger-pressed"],
      darkChannel: ch.dangerPressed,
      contrastText: ON_FILL,
      contrastTextChannel: ch.onFill,
    },
    Avatar: {
      defaultBg: c.bg.muted,
    },
  };
};

// The trailing `fontFamily` / `opacity` keys are App extensions of the MUI
// options shape, so the literal is typed here rather than inline.
const themeOptions: CssVarsThemeOptions & {
  fontFamily: { body: string };
  opacity: { inputPlaceholder: number };
} = {
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
    light: { palette: palette("light") },
    dark: { palette: palette("dark") },
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
          style: { color: ON_FILL },
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
};

let theme = extendMuiTheme(themeOptions);

export const useTheme = () => {
  return theme.colorSchemes[useRecoilValue(fos.theme)].palette;
};

/**
 * The mode whose `.dark` class is currently applied to the document. It
 * changes one pass after `fos.theme` does, once the class flip has happened,
 * so it is the right dependency for anything that resolves a Voodo token to a
 * concrete colour (`resolveCssColor`): keying on `fos.theme` directly would
 * re-resolve before the variables have switched.
 */
const AppliedThemeModeContext = React.createContext<Mode | null>(null);

export const useAppliedThemeMode = () =>
  React.useContext(AppliedThemeModeContext);

/** A Voodo token resolved to a concrete colour, re-resolved on theme change. */
export const useResolvedCssColor = (color: string): string => {
  const mode = useAppliedThemeMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mode is the signal
  return React.useMemo(() => resolveCssColor(color), [color, mode]);
};

export const useFont = () => {
  return theme.typography.fontFamily;
};

const ThemeProvider: React.FC<
  React.PropsWithChildren<{ customTheme?: typeof theme }>
> = ({ children, customTheme }) => {
  if (customTheme) theme = customTheme;
  const loadable = useRecoilValueLoadable(fos.theme);
  const current: Mode =
    loadable.state === "hasValue" ? loadable.contents : "dark";
  const [applied, setApplied] = React.useState<Mode>(current);

  // Sync dark class on document element for design-system components, then
  // publish the applied mode so token consumers re-resolve after the flip
  React.useLayoutEffect(() => {
    if (current === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setApplied(current);
  }, [current]);

  return (
    <LegacyTheme.Provider value={theme.colorSchemes[current].palette}>
      <CssVarsProvider theme={theme} defaultMode={current}>
        <AppliedThemeModeContext.Provider value={applied}>
          {children}
        </AppliedThemeModeContext.Provider>
      </CssVarsProvider>
    </LegacyTheme.Provider>
  );
};

export default ThemeProvider;
