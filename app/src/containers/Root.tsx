import React, { Suspense } from "react";
import { RecoilRoot } from "recoil";
import { ThemeProvider } from "styled-components";

import App from "./App";
import Setup from "./Setup";
import { GlobalStyle } from "../shared/global";
import { darkTheme } from "../shared/colors";

const Root = () => {
  return (
    <ThemeProvider theme={darkTheme}>
      <GlobalStyle />
      <RecoilRoot>
        <Suspense fallback={<Setup />}>
          <App />
        </Suspense>
      </RecoilRoot>
    </ThemeProvider>
  );
};

export default Root;
