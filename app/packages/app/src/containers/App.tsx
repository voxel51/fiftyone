import React, { Suspense, useLayoutEffect } from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { ThemeProvider as LegacyTheme } from "styled-components";

import TeamsForm from "../components/TeamsForm";

import * as atoms from "../recoil/atoms";

import { useScreenshot } from "../utils/hooks";

import Dataset from "./Dataset";
import Setup from "./Setup";
import { Error, Loading, Theme, useTheme } from "@fiftyone/components";

const ErrorPage: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  useLayoutEffect(() => {
    document.getElementById("modal")?.classList.remove("modalon");
  }, []);

  return (
    <Error
      error={error}
      reset={() => {
        resetErrorBoundary();
      }}
    />
  );
};

const Container = () => {
  useScreenshot();

  const theme = useTheme();

  const { open: teamsOpen } = useRecoilValue(atoms.teams);

  return (
    <LegacyTheme theme={theme}>
      <Theme>
        {true ? (
          <Suspense fallback={<Loading>Pixelating...</Loading>}>
            <Dataset />
          </Suspense>
        ) : (
          <Setup />
        )}
        {teamsOpen && <TeamsForm />}
      </Theme>
    </LegacyTheme>
  );
};

const App = () => {
  return (
    <ErrorBoundary FallbackComponent={ErrorPage}>
      <RecoilRoot>
        <Container />
      </RecoilRoot>
    </ErrorBoundary>
  );
};

export default App;
