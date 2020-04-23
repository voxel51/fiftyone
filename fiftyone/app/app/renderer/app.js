import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { ConnectedRouter } from "connected-react-router";
import { createMemoryHistory } from "history";
import routes from "./routes";
import configureStore from "./store";

const syncHistoryWithStore = (store, history) => {
  const { router } = store.getState();
  if (router && router.location) {
    history.replace(router.location);
  }
};

const initialState = {};
const routerHistory = createMemoryHistory();
const store = configureStore(initialState, routerHistory);
syncHistoryWithStore(store, routerHistory);

const rootElement = document.querySelector(
  document.currentScript.getAttribute("data-container")
);

ReactDOM.render(
  <Provider store={store}>
    <ConnectedRouter history={routerHistory}>{routes}</ConnectedRouter>
  </Provider>,
  rootElement
);
