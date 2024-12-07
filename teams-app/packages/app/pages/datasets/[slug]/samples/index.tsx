import {
  ErrorBoundary,
  IconButton,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Loading,
  ThemeProvider,
} from "@fiftyone/components";
import {
  useCurrentDatasetPermission,
  useCurrentOrganization,
  withPermissions,
} from "@fiftyone/hooks";
import type { ExecutionContext } from "@fiftyone/operators";
import { Writer, datasetQuery } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import {
  Box,
  BuiltinPanels,
  EmptySamples,
  ThemeProvider as HubThemeProvider,
} from "@fiftyone/teams-components";
import {
  EDIT_DATASET,
  INVITE_PEOPLE_TO_DATASET,
  VIEW_DATASET,
  hideHeaders,
  shareDatasetOpen,
  useCurrentDataset,
} from "@fiftyone/teams-state";
import { FIFTYONE_TEAMS_PROXY_ENDPOINT } from "@fiftyone/teams-state/src/constants";
import * as fou from "@fiftyone/utilities";
import { useColorScheme } from "@mui/material";
import { getEnv } from "lib/env";
import getTokenFromReq from "lib/getTokenFromReq";
import { GetServerSidePropsContext } from "next";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as recoil from "recoil";
import styled from "styled-components";
import DatasetNavigation from "../components/navigation";
import SessionContext from "./components/SessionContext";
import SnapshotBanner from "./components/SnapshotBanner";
import injectDynamicRouter from "./dynamicRouting/injectDynamicRouter";
import { resetSession } from "./dynamicRouting/useLocalSession";
import useTheme from "./useTheme";

if (typeof window !== "undefined") {
  fou.setFetchFunction(
    window.location.origin,
    {},
    FIFTYONE_TEAMS_PROXY_ENDPOINT
  );
  fos.setCurrentEnvironment(
    fos.getCurrentEnvironment() || fos.getEnvironment()
  );
}

const Container = styled.div`
  width: 100%;
  height: 100%;
  background: var(--fo-palette-background-level2);
  margin: 0;
  padding: 0;
  font-family: "Palanquin", sans-serif;
  font-size: 14px;
  color: var(--fo-palette-text-primary);
  display: flex;
  flex-direction: column;
  min-width: 660px;
`;
const ViewBarWrapper = styled.div`
  padding: 16px;
  background: var(--fo-palette-background-header);
  display: flex;
  align-items: center;
`;
const CoreDatasetContainer = styled.div`
  flex: 1;
  min-height: 0;
`;

const Guard = ({ children }: React.PropsWithChildren<{}>) => {
  const setModal = fos.useSetModalState();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setModal().then(() => setReady(true));
  }, [setModal]);

  if (ready) return <>{children}</>;

  return null;
};

const DynamicDataset = dynamic(
  async () => {
    await Promise.all([
      import("@fiftyone/embeddings"),
      import("@fiftyone/looker-3d"),
      import("@fiftyone/map"),
    ]);

    const {
      Dataset: CoreDataset,
      ViewBar,
      Snackbar,
      StarterSubtitle,
      QueryPerformanceToastTeams,
    } = await import("@fiftyone/core");
    const { registerOperator, types, Operator, OperatorConfig, OperatorCore } =
      await import("@fiftyone/operators");
    const { useOperatorBrowser } = await import(
      "@fiftyone/operators/src/state"
    );
    const { usePlugins } = await import("@fiftyone/plugins");

    class Share extends Operator {
      get config() {
        return new OperatorConfig({
          name: "share_link",
          label: "Share a link",
        });
      }

      async resolvePlacement() {
        return new types.Placement(types.Places.SAMPLES_VIEWER_ACTIONS, {
          label: "Share",
          options: {},
        });
      }
      useHooks() {
        const setOpen = recoil.useSetRecoilState(shareDatasetOpen);
        return {
          setOpen,
        };
      }
      async execute(ctx: ExecutionContext) {
        return ctx.hooks.setOpen(true);
      }
    }

    registerOperator(Share, "share_link");

    function Plugins({ children }: React.PropsWithChildren<{}>) {
      const plugins = usePlugins();
      if (plugins.isLoading) return <Loading>Pixelating...</Loading>;
      return (
        <>
          {children}
          <BuiltinPanels />
        </>
      );
    }

    const useDynamicRouter = injectDynamicRouter();

    function EmbeddedDatasetWithContext(props: EmbeddedDatasetPropsType) {
      const { hasSamples } = props;
      const browser = useOperatorBrowser();

      return (
        <>
          <Plugins>
            {hasSamples ? (
              <>
                <ViewBarWrapper>
                  <ViewBar />
                  <HeadersToggle />
                </ViewBarWrapper>
                <CoreDatasetContainer>
                  <CoreDataset />
                </CoreDatasetContainer>

                <Snackbar />
                <QueryPerformanceToastTeams />
              </>
            ) : (
              <HubThemeProvider>
                <EmptySamples {...props} OperatorComponent={StarterSubtitle} />
              </HubThemeProvider>
            )}
            <OperatorCore />
          </Plugins>
          <div id="modal" />
          <div id="colorModal" />
          <div id="queryPerformance"></div>
        </>
      );
    }

    function EmbeddedDataset(props: EmbeddedDatasetPropsType) {
      const router = useDynamicRouter();
      useTheme();
      if (router.loading) {
        return <Pixelating />;
      }

      return (
        <>
          {router.state.page.snapshotData && (
            <Box p={2}>
              <SnapshotBanner snapshotData={router.state.page.snapshotData} />
            </Box>
          )}
          <ErrorBoundary
            onReset={() => {
              resetSession(router.datasetName);
              window.location.reload();
            }}
          >
            <ThemeProvider>
              <SessionContext page={router.state.page}>
                <Writer<datasetQuery>
                  read={() => router.state.page}
                  setters={router.state.setters}
                  subscribe={router.state.subscribe}
                >
                  <Guard>
                    <EmbeddedDatasetWithContext {...props} />
                  </Guard>
                </Writer>
              </SessionContext>
            </ThemeProvider>
          </ErrorBoundary>
        </>
      );
    }

    return EmbeddedDataset;
  },
  { loading: () => <Pixelating />, ssr: false }
);

function Dataset() {
  const datasetContainer = useRef<HTMLDivElement>(null);
  const [topOffset, setTopOffset] = useState(130);
  const hideHeadersState = recoil.useRecoilValue(hideHeaders);

  const router = useRouter();
  const { slug } = router.query;
  const currentOrganization = useCurrentOrganization();
  const organizationDisplayName = currentOrganization?.displayName;
  const canEdit = useCurrentDatasetPermission([EDIT_DATASET]);
  const dataset = useCurrentDataset(slug as string);
  const datasetName = dataset?.name || "";
  const canInvite = useCurrentDatasetPermission([INVITE_PEOPLE_TO_DATASET]);
  const hasSamples = !!dataset?.samplesCount;

  useLayoutEffect(() => {
    if (datasetContainer?.current)
      setTopOffset(datasetContainer.current.offsetTop);
  }, [hideHeadersState]);

  const HEIGHT_OF_HEADERS = `${topOffset}px`;
  return (
    <Box>
      <Box>
        <DatasetNavigation />
      </Box>
      <Box
        pl={0.25}
        ref={datasetContainer}
        sx={{
          height: `calc(100vh - ${HEIGHT_OF_HEADERS})`,
          overflow: hasSamples ? "hidden" : "auto",
          "--Icon-fontSize": "1.5rem",
          position: "relative",
        }}
      >
        <Container>
          <DynamicDataset
            slug={slug as string}
            canEdit={canEdit}
            canInvite={canInvite}
            organizationDisplayName={organizationDisplayName}
            datasetName={datasetName}
            hasSamples={hasSamples}
          />
        </Container>
      </Box>
    </Box>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const token = getTokenFromReq(ctx.req);

  return {
    props: { ...getEnv(), token },
  };
}

const HeadersToggle = () => {
  const [hide, toggle] = recoil.useRecoilState(hideHeaders);
  return (
    <div
      style={{
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconButton
        title={`${hide ? "Show" : "Hide"} headers`}
        onClick={() => toggle((cur) => !cur)}
        disableRipple
        sx={{
          color: (theme) => theme.palette.text.secondary,
          width: "100%",
          height: "100%",
        }}
      >
        {hide && <KeyboardArrowDown />}
        {!hide && <KeyboardArrowUp />}
      </IconButton>
    </div>
  );
};

export default withPermissions(Dataset, [VIEW_DATASET], "dataset", {
  getLayoutProps: () => ({
    hideFooter: true,
    topNavProps: {
      noBorder: true,
    },
  }),
});

function Pixelating() {
  const { mode } = useColorScheme();
  return (
    <Loading
      style={{
        color: mode === "dark" ? "hsl(200, 0%, 70%)" : "hsl(200, 0%, 30%)",
      }}
    >
      Pixelating...
    </Loading>
  );
}

type EmbeddedDatasetPropsType = {
  datasetName: string;
  organizationDisplayName: string;
  canEdit: boolean;
  canInvite: boolean;
  slug: string;
  hasSamples: boolean;
};
