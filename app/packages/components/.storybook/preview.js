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
 */
function ThemeDecorator({ Story }) {
  useEffect(() => {
    document.body.classList.add("dark");
    const prevBg = document.body.style.background;
    const prevColor = document.body.style.color;
    document.body.style.background = "var(--color-content-bg-background)";
    document.body.style.color = "var(--color-content-text-primary)";
    return () => {
      document.body.classList.remove("dark");
      document.body.style.background = prevBg;
      document.body.style.color = prevColor;
    };
  }, []);
  return React.createElement(Story);
}

export const decorators = [
  (Story) => React.createElement(ThemeDecorator, { Story }),
];
