import { ColorTheme, darkTheme, toSnakeCase } from "@fiftyone/utilities";
import React, { useContext, useLayoutEffect } from "react";
import { ThemeContext as LegacyTheme } from "styled-components";

const Theme: React.FC<React.PropsWithChildren<{ theme: ColorTheme }>> = ({
  children,
  theme,
}) => {
  useLayoutEffect(() => {
    const snake = toSnakeCase(theme);
    for (const key in snake) {
      document.documentElement.style.setProperty(
        `--${key.replace(/_/g, "-")}`,
        snake[key]
      );
    }
  }, [theme]);
  return (
    <ThemeContext.Provider value={theme}>
      <LegacyTheme.Provider value={theme}>{children}</LegacyTheme.Provider>
    </ThemeContext.Provider>
  );
};

export const ThemeContext = React.createContext(darkTheme);

export const useTheme = () => {
  return useContext(ThemeContext);
};

export default Theme;
