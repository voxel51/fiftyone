import React from "react";
import { Provider } from "react-redux";
import { RecoilRoot } from "recoil";
import { ConnectedRouter } from "connected-react-router";
import { hot } from "react-hot-loader/root";
import { History } from "history";
import { ThemeProvider } from "styled-components";

import { GlobalStyle } from "../shared/global";
import { darkTheme } from "../shared/colors";
import { Store } from "../reducers/types";
import Routes from "../Routes";

type Props = {
  store: Store;
  history: History;
};

const Root = ({ store, history }: Props) => {
  return (
    <ThemeProvider theme={darkTheme}>
      <GlobalStyle />
      <Provider store={store}>
        <ConnectedRouter history={history}>
          <RecoilRoot>
            <Routes />
          </RecoilRoot>
        </ConnectedRouter>
      </Provider>
    </ThemeProvider>
  );
};

export default hot(Root);
