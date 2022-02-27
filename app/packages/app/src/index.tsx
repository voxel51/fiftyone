import {
  getRoutingContext,
  Loading,
  RouteRenderer,
  withErrorBoundary,
  withRelayEnvironment,
  withTheme,
} from "@fiftyone/components";
import {
  darkTheme,
  getEventSource,
  Resource,
  setFetchFunction,
} from "@fiftyone/utilities";
import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { atom, RecoilRoot, useSetRecoilState } from "recoil";

import Setup from "./components/Setup";
import * as atoms from "./recoil/atoms";

import { useScreenshot } from "./utils/hooks";

import "./index.css";
import routes from "./routes";

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

enum Events {
  UPDATE = "Update",
}

setFetchFunction("http://localhost:5151");

const App = withErrorBoundary(
  withRelayEnvironment(
    withTheme(() => {
      const setState = useSetRecoilState(atoms.stateDescription);
      const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);

      useEffect(() => {
        const controller = new AbortController();

        getEventSource(
          "/state",
          {
            onmessage: (msg) => {
              console.log(msg);
              if (msg.event === Events.UPDATE) {
                setState(JSON.parse(msg.data));
              }
            },
            onopen: async (response) => {
              setReadyState(AppReadyState.OPEN);
            },
            onclose: () => {
              setReadyState(AppReadyState.CLOSED);
            },
          },
          controller.signal
        );

        return () => controller.abort();
      }, []);

      useScreenshot();

      return (
        <>
          {readyState < 2 ? (
            <Suspense fallback={<Loading>Pixelating...</Loading>}>
              <RouteRenderer router={getRoutingContext()} />
            </Suspense>
          ) : (
            <Setup />
          )}
        </>
      );
    }, atom({ key: "theme", default: darkTheme })),
    routes
  )
);

const Root = withErrorBoundary(() => {
  return (
    <RecoilRoot>
      <App />
    </RecoilRoot>
  );
});

const root = document.getElementById("root") as HTMLDivElement;

ReactDOM.createRoot(root).render(<Root />);
