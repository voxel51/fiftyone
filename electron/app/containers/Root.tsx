import React from "react";
import { RecoilRoot } from "recoil";
import { hot } from "react-hot-loader/root";
import { ThemeProvider } from "styled-components";

import { GlobalStyle } from "../shared/global";
import { darkTheme } from "../shared/colors";
import { Store } from "../reducers/types";
import Routes from "../Routes";

type Props = {
  store: Store;
  history: History;
};

const Root = ({ store }: Props) => {
  return (
    <ThemeProvider theme={darkTheme}>
      <GlobalStyle />
      <RecoilRoot>
        <Routes />
      </RecoilRoot>
    </ThemeProvider>
  );
};

export default hot(Root);
