import React from "react";
import { RecoilRoot } from "recoil";
import { ThemeProvider } from "styled-components";

import App from "./App";
import { GlobalStyle } from "../shared/global";
import { darkTheme, lightTheme } from "../shared/colors";

const Root = () => {
  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyle />
      <RecoilRoot>
        <App />
      </RecoilRoot>
    </ThemeProvider>
  );
};

export default Root;
