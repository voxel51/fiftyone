import React, { Suspense, useCallback, useEffect, useState } from "react";
import { atom, RecoilRoot, useRecoilState, useRecoilValue } from "recoil";

import TeamsForm from "../components/TeamsForm";

import * as atoms from "../recoil/atoms";

import { useEventHandler, useScreenshot } from "../utils/hooks";

import Dataset from "./Dataset";
import Setup from "./Setup";
import { Loading, withErrorBoundary, withTheme } from "@fiftyone/components";
import {
  darkTheme,
  getFetchHost,
  Resource,
  setFetchFunction,
  SSEClient,
} from "@fiftyone/utilities";
import { State } from "../recoil/types";

const UpdatesReader: React.FC<{
  closed: React.ReactNode;
  resource: Resource<State.Description>;
}> = ({ children, resource }) => {
  resource.read();

  useScreenshot();

  return <>{children}</>;
};

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

setFetchFunction("http://localhost:5151", {});

const Container = withTheme(
  withErrorBoundary(() => {
    const [client] = useState(
      () =>
        new SSEClient(`${getFetchHost()}/state`, {
          reconnect: true,
        })
    );

    const [resource] = useState(() => {
      const resource = new Resource<State.Description>(
        () =>
          new Promise((resolve, reject) => {
            const listener = (data) => {
              resolve(data as State.Description);
              client.removeEventListener("update", listener);
            };

            client.addEventListener("update", listener);
            client.stream();
          })
      );

      resource.load();
      return resource;
    });

    const [state, setState] = useRecoilState(atoms.stateDescription);
    const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);

    useEventHandler(
      client,
      "open",
      useCallback(() => {
        setReadyState(AppReadyState.OPEN);
      }, [])
    );
    useEventHandler(
      client,
      "close",
      useCallback(() => {
        setReadyState(AppReadyState.CLOSED);
        setState(null);
      }, [])
    );

    const stateValue = resource.get();

    useEffect(() => {
      stateValue && setState(stateValue);
    }, [stateValue]);

    const { open: teamsOpen } = useRecoilValue(atoms.teams);

    return (
      <>
        {readyState === AppReadyState.OPEN && state ? (
          <Suspense fallback={<Loading>Pixelating...</Loading>}>
            <UpdatesReader closed={closed} resource={resource}>
              <Dataset />
            </UpdatesReader>
          </Suspense>
        ) : (
          <Setup />
        )}
        {teamsOpen && <TeamsForm />}
      </>
    );
  }),
  atom({ key: "theme", default: darkTheme })
);

const App = () => {
  return (
    <RecoilRoot>
      <Container />
    </RecoilRoot>
  );
};

export default App;
