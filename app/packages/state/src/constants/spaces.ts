export const FIFTYONE_GRID_SPACES_ID = "fiftyone-spaces";
export const FIFTYONE_MODAL_SPACES_ID = "fiftyone-modal-spaces";
// Masataka Okabe and Kei Ito have proposed a palette of 8 colors on their
// website Color Universal Design (CUD). This palette is a “Set of colors that
// is unambiguous both to colorblinds and non-colorblinds”.
//
// https://jfly.uni-koeln.de/color/
export const COLOR_BLIND_FRIENDLY_PALETTE = [
  "#E69F00", // orange
  "#56b4e9", // skyblue
  "#009e74", // bluegreen
  "#f0e442", // yellow
  "#0072b2", // blue
  "#d55e00", // vermillion
  "#cc79a7", // reddish purple
];

export enum PANEL_SURFACE {
  GRID = "grid",
  MODAL = "modal",
}
