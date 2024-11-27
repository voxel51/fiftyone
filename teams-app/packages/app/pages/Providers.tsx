import { ThemeProvider } from "@fiftyone/teams-components";
import {
  getTeamsClientEnvironment,
  recoilEnvironmentKey,
  TeamsRelayEnvironment,
} from "@fiftyone/teams-state";
import { SnackbarProvider } from "notistack";
import React from "react";
import { Environment } from "react-relay";
import { RecoilRoot } from "recoil";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";

const clientEnvironment = getTeamsClientEnvironment();

const Providers: React.FC<
  React.PropsWithChildren<{ environment?: Environment }>
> = ({ children, environment }) => {
  return (
    <RecoilRoot>
      <TeamsRelayEnvironment.Provider value={environment || clientEnvironment}>
        <RecoilRelayEnvironmentProvider
          environment={environment || clientEnvironment}
          environmentKey={recoilEnvironmentKey}
        >
          <SnackbarProvider maxSnack={3}>
            <ThemeProvider>{children}</ThemeProvider>
          </SnackbarProvider>
        </RecoilRelayEnvironmentProvider>
      </TeamsRelayEnvironment.Provider>
    </RecoilRoot>
  );
};

export default Providers;
