import { rgba } from "@react-spring/shared";

export const white100 = "hsl(0, 0%, 100%)";
export const white96 = "hsl(0, 0%, 96%)";
export const white85 = "hsl(0, 0%, 85%)";
export const white59 = "hsl(0, 0%, 59%)";
export const white20 = "hsl(0, 0%, 20%)";

export const white59a = "hsla(0, 0%, 59%, 0.5)";
export const white100a = "hsla(0, 0% , 0%, 0.14)";

export const grey81 = "hsl(216, 5%, 81%)";
export const grey66 = "hsl(220, 2%, 66%)";
export const grey46 = "hsl(208, 7%, 46%)";
export const grey23 = "hsl(207, 10%, 23%)";
export const grey10 = "hsl(216, 10%, 10%)";

export const grey46a13 = "hsla(208, 7%, 46%, 0.13)";
export const grey46a30 = "hsla(208, 7%, 46%, 0.3)";
export const grey46a70 = "hsla(208, 7%, 46%, 0.7)";

export const blue90 = "hsl(210, 20%, 90%)";
export const blue50 = "hsl(210, 20%, 50%)";
export const blue15 = "hsl(210, 20%, 15%)";

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

export type ColorTheme = {
  background: string;
  backgroundDark: string;
  backgroundDarker: string;
  backgroundLight: string;
  backgroundLightBorder: string; // i.e. for components with the light background color
  backgroundDarkBorder: string;
  backgroundTransparent: string;
  border: string;
  borderLight: string;
  button: string;
  buttonBorder: string;

  brand: string;
  brandDark: string;
  brandTransparent: string;
  brandMoreTransparent: string;
  brandFullyTransparent: string;

  font: string;
  fontDark: string;
  fontDarkest: string;

  secondary: string;
  secondaryLight: string;

  error: string;
};

export const darkTheme: ColorTheme = {
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

export const lightTheme: ColorTheme = {
  ...darkTheme,
  background: "rgb(250, 250, 250)",
  backgroundDark: "rgb(242, 242, 242)",
  backgroundDarker: "rgb(233, 233, 233)",
  backgroundLight: "rgb(220, 220, 220)",
  backgroundLightBorder: "rgb(240, 240, 240)",
  backgroundDarkBorder: "rgb(235, 235, 235))",
  backgroundTransparent: "rgb(250, 250, 250, 0.7)",
  border: grey37,
  borderLight: grey24,
  button: "rgb(233, 233, 233)",
  buttonBorder: "rgb(215, 215, 215)",

  font: "rgba(40, 40, 40, 0.9)",
  fontDark: "rgba(10, 10, 10, 0.9)",
  fontDarkest: "rgba(0, 0, 0, 0.9)",
};
