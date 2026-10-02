import * as fos from "@fiftyone/state";
import {
  type CssVarsThemeOptions,
  Experimental_CssVarsProvider as CssVarsProvider,
  experimental_extendTheme as extendMuiTheme,
} from "@mui/material/styles";
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

// Every palette value is the literal colour of a Voodo token, read from the
// design system's token data per mode. The legacy `theme.*` and
// `--fo-palette-*` surfaces therefore stay plain colours that MUI, plotly,
// canvas and colour libraries can parse, exactly as they were before, while
// tracking Voodo's values (and renames) at build time. Light and dark follow
// mode through MUI's two colour schemes, as they always have.
//
// Code that uses a `cssVar.color.*` reference directly, rather than the
// theme, must still go through `resolveCssColor` from `@fiftyone/utilities`
// before handing it to anything that parses colours in JS.

// Figma has no contrast-text token; every filled colour here is a
// mode-independent fill, so white is correct in both themes.
const ON_FILL = "#FFFFFF";

type Mode = "light" | "dark";

// Voodo's translucent tokens (scrims, focus ring, selection) are authored as
// `color-mix(in srgb, #rrggbb N%, transparent)`. MUI needs a literal it can
// decompose, and that mix is exactly `rgba(r, g, b, N/100)`.
const COLOR_MIX_OVER_TRANSPARENT =
  /^color-mix\(in srgb,\s*#([0-9a-f]{6})\s+([\d.]+)%,\s*transparent\)$/i;

const literal = (value: string): string => {
  const m = COLOR_MIX_OVER_TRANSPARENT.exec(value);
  if (!m) {
    return value;
  }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Number(m[2]) / 100})`;
};

const palette = (mode: Mode) => {
  // Mirrors the shape of `cssVar.color`: mode-dependent groups plus the
  // mode-independent brand / semantic groups.
  const t = { ...colors[mode].content, ...colors.common };
  return {
    themeMode: mode,
    action: {
      active: t.icon.default,
      disabled: t.icon.disabled,
      hover: t.interactive["secondary-hover"],
      selected: t.interactive["secondary-default"],
      disabledBackground: t.bg.muted,
      focus: literal(t.focus.ring),
    },
    background: {
      default: t.bg.background,
      paper: t.bg.background,
      body: t.bg.secondary,
      button: t.bg["card-elevated"],
      header: t.bg.card,
      input: t.bg.card,
      level1: t.bg["card-elevated"],
      level2: t.bg.background,
      level3: t.bg.popover,
      looker: t.bg.background,
      mediaSpace: t.bg.background,
      mediaSpaceTransparent: "transparent",
      modalBackdrop: literal(t.scrim.light),
      sidebar: t.bg.background,
      tooltip: t.tooltip.bg,
      viewBarButtons: t.bg.card,
      inactiveTab: t.bg.muted,
      popup: t.bg["card-elevated"],
      field: t.bg.muted,
      activeCell: t.interactive["secondary-hover"],
      card: t.bg.card,
    },
    common: {
      background: t.bg.background,
      onBackground: t.text.primary,
    },
    divider: t.border.default,
    dividerDisabled: t.border.disabled,
    danger: {
      plainColor: t.semantic.destructive,
    },
    grey: {
      400: t.text.inverse,
      5: t.bg.popover,
    },
    neutral: {
      plainColor: t.semantic.info,
      softBg: t.bg.muted,
      softBorder: t.border.strong,
    },
    primary: {
      main: t.brand.primary,
      light: t.brand.accent,
      dark: t.interactive["primary-pressed"],
      contrastText: ON_FILL,
      plainColor: t.brand.primary,
      plainBorder: t.border.default,
      softBg: t.interactive["secondary-hover"],
      softBorder: t.border.subtle,
    },
    secondary: {
      main: t.text.secondary,
      light: t.text.tertiary,
      dark: t.text.primary,
      contrastText: t.bg.background,
    },
    tertiary: {
      main: t.bg.card,
      hover: t.bg["card-elevated"],
    },
    focusVisible: literal(t.focus.ring),
    text: {
      buttonHighlight: ON_FILL,
      primary: t.text.primary,
      secondary: t.text.secondary,
      tertiary: t.text.tertiary,
      disabled: t.text.placeholder,
      invert: t.text.inverse,
    },
    custom: {
      shadow: literal(t.scrim.light),
      shadowDark: literal(t.scrim.default),
      lightning: t.semantic.warning,
      toastBackgroundColor: t.tooltip.bg,
      primarySoft: t.brand.accent,
      primaryMedium: t.brand.accent,
    },
    voxel: {
      500: t.brand.primary,
      600: t.interactive["primary-pressed"],
    },
    error: {
      main: t.interactive["danger-default"],
      light: t.interactive["danger-hover"],
      dark: t.interactive["danger-pressed"],
      contrastText: ON_FILL,
    },
    Avatar: {
      defaultBg: t.bg.muted,
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
 * so it is the right dependency for anything that resolves a `cssVar.color.*`
 * token to a concrete colour (`resolveCssColor`): keying on `fos.theme`
 * directly would re-resolve before the variables have switched.
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
