import React from "react";
import { RecoilRoot } from "recoil";
import { ThemeProvider } from "styled-components";

import { GlobalStyle } from "../shared/global";
import { darkTheme } from "../shared/colors";
import Routes from "../Routes";

const Root = () => {
  return (
    <ThemeProvider theme={darkTheme}>
      <GlobalStyle />
      <RecoilRoot>
        <Routes />
      </RecoilRoot>
    </ThemeProvider>
  );
};

export default Root;
