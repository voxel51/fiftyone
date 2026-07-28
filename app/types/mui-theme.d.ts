import "@mui/material/styles";

declare module "@mui/material/styles" {
  interface ZIndex {
    operatorPalette: number;
  }

  interface Palette {
    themeMode: "light" | "dark";
    dividerDisabled: string;
    danger: { plainColor: string };
    neutral: { plainColor: string; softBg: string; softBorder: string };
    tertiary: { main: string; hover: string };
    focusVisible: string;
    custom: {
      shadow: string;
      shadowDark: string;
      lightning: string;
      toastBackgroundColor: string;
      primarySoft: string;
      primaryMedium?: string;
    };
    voxel: { 500: string; 600: string };
  }

  interface PaletteOptions {
    themeMode?: "light" | "dark";
    dividerDisabled?: string;
    danger?: { plainColor?: string };
    neutral?: { plainColor?: string; softBg?: string; softBorder?: string };
    tertiary?: { main?: string; hover?: string };
    focusVisible?: string;
    custom?: {
      shadow?: string;
      shadowDark?: string;
      lightning?: string;
      toastBackgroundColor?: string;
      primarySoft?: string;
      primaryMedium?: string;
    };
    voxel?: { 500?: string; 600?: string };
  }

  interface PaletteColor {
    plainBorder: string;
    plainColor: string;
    softBg: string;
    softBorder: string;
  }

  interface SimplePaletteColorOptions {
    plainBorder?: string;
    plainColor?: string;
    softBg?: string;
    softBorder?: string;
  }

  interface TypeBackground {
    body: string;
    button: string;
    header: string;
    input: string;
    level1: string;
    level2: string;
    level3: string;
    looker: string;
    mediaSpace: string;
    mediaSpaceTransparent: string;
    modalBackdrop: string;
    sidebar: string;
    tooltip: string;
    viewBarButtons: string;
    inactiveTab: string;
    popup: string;
    field: string;
    activeCell: string;
    card: string;
  }

  interface TypeText {
    buttonHighlight: string;
    tertiary: string;
    lookerTag: string;
    invert: string;
  }
}
