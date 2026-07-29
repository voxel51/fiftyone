export * from "./components";

import scrollableStyles from "./scrollable.module.css";

/**
 * The height of the view bar's gutter, and of anything that must line up with
 * it. Nested pieces derive their height from this rather than carrying their
 * own number.
 */
export const CHROME_CONTROL_HEIGHT = 40;

export const scrollable = scrollableStyles.scrollable;
export const scrollableSm = scrollableStyles.scrollableSm;

import jsonIcon from "./icons/json.svg";
import helpIcon from "./icons/help.svg";

export { jsonIcon, helpIcon };
