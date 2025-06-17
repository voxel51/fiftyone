import "@mui/material/styles";

declare module "@mui/material/styles" {
  interface ZIndex {
    operatorPalette: number;
  }

  interface Palette {
    themeMode: "light" | "dark";
  }

  interface PaletteOptions {
    themeMode?: "light" | "dark";
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
