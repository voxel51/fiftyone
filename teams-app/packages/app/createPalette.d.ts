import {
  Palette as MuiPallete,
  PaletteOptions as MuiPaletteOptions,
} from "@mui/material/styles/createPalette";

declare module "@mui/material/styles/createPalette" {
  interface Palette extends MuiPallete {
    grey: { 25: string; primary: string; secondary: srting };
    red: { 25: string; primary: string; secondary: string };
  }

  interface PaletteOptions extends MuiPaletteOptions {
    grey: { 25: string; primary: string; secondary: srting };
    red: { 25: string; primary: string; secondary: srting };
  }
}
