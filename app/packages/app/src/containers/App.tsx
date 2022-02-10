import React, { useState, useRef, Suspense } from "react";
import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import { ErrorBoundary, useErrorHandler } from "react-error-boundary";

import Header from "../components/Header";
import TeamsForm from "../components/TeamsForm";

import * as atoms from "../recoil/atoms";
import { useClearModal } from "../recoil/utils";
import socket, { handleId, isNotebook } from "../shared/connection";
import {
  useEventHandler,
  useMessageHandler,
  useSendMessage,
  useUnprocessedStateUpdate,
} from "../utils/hooks";

import Dataset from "./Dataset";
import ErrorPage from "./Error";
import Loading from "../components/Loading";
import Setup from "./Setup";

const useClose = () => {
  const clearModal = useClearModal();
  return useRecoilTransaction_UNSTABLE(
    ({ reset, set }) => async () => {
      clearModal();
      set(atoms.connected, false);
      reset(atoms.stateDescription);
    },
    []
  );
};

const Container = () => {
  const addNotification = useRef(null);
  const connected = useRecoilValue(atoms.connected);

  useEventHandler(socket, "close", useClose());
  useMessageHandler("update", useUnprocessedStateUpdate());

  useSendMessage("as_app", {
    notebook: isNotebook,
    handle: handleId,
  });

  const handleError = useErrorHandler();

  useMessageHandler("error", (data) => {
    handleError(data);
  });
  const { open: teamsOpen } = useRecoilValue(atoms.teams);

  return (
    <>
      <Header addNotification={addNotification} />
      {connected ? (
        <Suspense fallback={<Loading text={"Loading..."} />}>
          <Dataset />
        </Suspense>
      ) : (
        <Setup />
      )}
      {teamsOpen && <TeamsForm />}
    </>
  );
};

const App = () => {
  const [reset, setReset] = useState(false);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorPage}
      onReset={() => setReset(true)}
      resetKeys={[reset]}
    >
      <Container />
    </ErrorBoundary>
  );
};

export default App;
