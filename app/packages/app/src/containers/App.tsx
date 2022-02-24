import React, { Suspense } from "react";
import { atom, RecoilRoot, useRecoilValue } from "recoil";

import TeamsForm from "../components/TeamsForm";

import * as atoms from "../recoil/atoms";

import { useScreenshot } from "../utils/hooks";

import Dataset from "./Dataset";
import Setup from "./Setup";
import {
  Loading,
  withErrorBoundary,
  withTheme,
  withUpdates,
} from "@fiftyone/components";
import { darkTheme } from "@fiftyone/utilities";

const Container = withUpdates(
  withErrorBoundary(
    withTheme(() => {
      useScreenshot();

      const { open: teamsOpen } = useRecoilValue(atoms.teams);

      return (
        <>
          {true ? (
            <Suspense fallback={<Loading>Pixelating...</Loading>}>
              <Dataset />
            </Suspense>
          ) : (
            <Setup />
          )}
          {teamsOpen && <TeamsForm />}
        </>
      );
    }, atom({ key: "theme", default: darkTheme }))
  )
);

const App = () => {
  return (
    <RecoilRoot>
      <Container />
    </RecoilRoot>
  );
};

export default App;
