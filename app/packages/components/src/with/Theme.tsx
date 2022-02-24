import { RecoilState, useRecoilState, useRecoilValue } from "recoil";
import { ColorTheme, toSnakeCase } from "@fiftyone/utilities";
import React, { useLayoutEffect } from "react";
import { ThemeContext as LegacyTheme } from "styled-components";

let atom: RecoilState<ColorTheme>;

export const useTheme = () => {
  return useRecoilState(atom);
};

const withTheme = <P extends {}>(
  Component: React.FC<P>,
  themeAtom: RecoilState<ColorTheme>
) => {
  atom = themeAtom;

  return (props: P) => {
    const theme = useRecoilValue(themeAtom);

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
      <LegacyTheme.Provider value={theme}>
        <Component {...props} />
      </LegacyTheme.Provider>
    );
  };
};

export default withTheme;
