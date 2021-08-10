import React from "react";
import { RecoilRoot } from "recoil";
import { ThemeProvider } from "styled-components";

import App from "./App";
import { GlobalStyle } from "../shared/global";
import { darkTheme } from "../shared/colors";

const Root = () => {
  return (
    <ThemeProvider theme={darkTheme}>
      <GlobalStyle />
      <RecoilRoot>
        <App />
      </RecoilRoot>
    </ThemeProvider>
  );
};

export default Root;
