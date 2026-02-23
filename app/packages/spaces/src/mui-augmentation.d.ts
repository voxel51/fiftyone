/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Local MUI theme augmentation for the spaces package.
 * These types reflect the custom theme defined in @fiftyone/components ThemeProvider.
 * The canonical declaration lives in packages/components/src/components/ThemeProvider/mui.d.ts;
 * this file exists so that the spaces package can benefit from the augmentations without
 * pulling in the entire components package into the typecheck scope.
 */

import "@mui/material/styles";

declare module "@mui/material/styles" {
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

  interface Palette {
    themeMode: "light" | "dark";
    custom: {
      shadow: string;
      shadowDark: string;
      lightning: string;
      toastBackgroundColor: string;
      primarySoft: string;
    };
  }

  interface PaletteOptions {
    themeMode?: "light" | "dark";
    custom?: {
      shadow?: string;
      shadowDark?: string;
      lightning?: string;
      toastBackgroundColor?: string;
      primarySoft?: string;
    };
  }
}
