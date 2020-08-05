import React from "react";
import { Provider } from "react-redux";
import { RecoilRoot } from "recoil";
import { ConnectedRouter } from "connected-react-router";
import { hot } from "react-hot-loader/root";
import { History } from "history";
import { HotKeys } from "react-hotkeys";

import { Store } from "../reducers/types";
import Routes from "../Routes";
import { viewBarKeyMap } from "../components/ViewBar/ViewBar";

type Props = {
  store: Store;
  history: History;
};

const keyMap = {
  ...viewBarKeyMap,
};

const Root = ({ store, history }: Props) => (
  <Provider store={store}>
    <ConnectedRouter history={history}>
      <HotKeys keyMap={keyMap}>
        <RecoilRoot>
          <Routes />
        </RecoilRoot>
      </HotKeys>
    </ConnectedRouter>
  </Provider>
);

export default hot(Root);
