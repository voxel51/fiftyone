// Hover/press feedback for small icon affordances; applied to the click
// target itself because Tailwind hover:/active: don't reach children.
export const PRESS_CLASS =
  "cursor-pointer flex items-center justify-center p-1.5 hover:scale-[1.1] active:scale-[0.92] transition-transform duration-[150ms] ease-out";

// Translucent so grid samples stay partly visible behind the label.
export const TOOLTIP_CLASS =
  "!bg-black/70 !text-white backdrop-blur-sm whitespace-nowrap";
