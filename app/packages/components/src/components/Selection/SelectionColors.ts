export const COLOR_OPTIONS_MAP = {
  "#2970FF": { id: "blue", label: "Blue", color: "#2970FF", description: "" },
  "#06AED4": { id: "cyan", label: "Cyan", color: "#06AED4", description: "" },
  "#16B364": { id: "green", label: "Green", color: "#16B364", description: "" },
  "#FAC515": {
    id: "yellow",
    label: "Yellow",
    color: "#FAC515",
    description: "",
  },
  "#EF6820": {
    id: "orange",
    label: "Orange",
    color: "#EF6820",
    description: "",
  },
  "#F04438": { id: "red", label: "Red", color: "#F04438", description: "" },
  "#EE46BC": { id: "pink", label: "Pink", color: "#EE46BC", description: "" },
  "#7A5AF8": {
    id: "purple",
    label: "Purple",
    color: "#7A5AF8",
    description: "",
  },
  "667085": { id: "gray", label: "Gray", color: "#667085", description: "" },
};
export const COLOR_OPTIONS = Object.values(COLOR_OPTIONS_MAP);
export const DEFAULT_COLOR = Object.keys(COLOR_OPTIONS_MAP)[0];
export const DEFAULT_COLOR_OPTION = COLOR_OPTIONS_MAP[DEFAULT_COLOR];
