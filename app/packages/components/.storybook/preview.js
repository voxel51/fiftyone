import React, { useEffect } from "react";
import "@voxel51/voodo/theme.css";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

/**
 * Applies the `.dark` class to `document.body` so the dark-theme CSS variable
 * cascade reaches every element on the page — including portaled content
 * (dropdowns, modals, tooltips) that mounts directly under `<body>` and would
 * otherwise miss a wrapper-div theme class.
 *
 * Reference-counted so concurrent stories (e.g. on docs pages that mount
 * multiple stories at once) don't fight: the first mount captures the prior
 * theme + applies the dark class, the last unmount restores.
 */
let themeDecoratorMounts = 0;
let prevBodyTheme = null;

function ThemeDecorator({ Story }) {
  useEffect(() => {
    if (themeDecoratorMounts === 0) {
      prevBodyTheme = {
        hadDarkClass: document.body.classList.contains("dark"),
        background: document.body.style.background,
        color: document.body.style.color,
      };
      document.body.classList.add("dark");
      document.body.style.background = "var(--color-content-bg-background)";
      document.body.style.color = "var(--color-content-text-primary)";
    }
    themeDecoratorMounts += 1;
    return () => {
      themeDecoratorMounts -= 1;
      if (themeDecoratorMounts === 0 && prevBodyTheme) {
        if (!prevBodyTheme.hadDarkClass) {
          document.body.classList.remove("dark");
        }
        document.body.style.background = prevBodyTheme.background;
        document.body.style.color = prevBodyTheme.color;
        prevBodyTheme = null;
      }
    };
  }, []);
  return React.createElement(Story);
}

export const decorators = [
  (Story) => React.createElement(ThemeDecorator, { Story }),
];
