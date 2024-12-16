import { useAnalyticsInfo, usingAnalytics } from "@fiftyone/analytics";
import { ErrorBoundary, Pending } from "@fiftyone/components";
import {
  useBooleanEnv,
  useCurrentOrganization,
  useCurrentUser,
  useEnv,
  useInitializeApp,
  useProductVersion,
} from "@fiftyone/hooks";
import {
  AnalyticsConsent,
  AppAlert,
  Box,
  Footer,
  MainTitle,
  layout,
} from "@fiftyone/teams-components";
import { getTeamsClientEnvironment } from "@fiftyone/teams-state";
import {
  FIFTYONE_APP_ANONYMOUS_ANALYTICS_ENABLED,
  FIFTYONE_APP_DEMO_MODE,
  FIFTYONE_APP_SEGMENT_WRITE_KEY,
  FIFTYONE_APP_SERVICE_WORKER_ENABLED,
  FIFTYONE_DO_NOT_TRACK_LS,
} from "@fiftyone/teams-state/src/constants";
import {
  deregisterAllServiceWorkers,
  registerServiceWorker,
} from "lib/serviceWorkerUtils";
import { AppProps } from "next/app";
import { useRouter } from "next/router";
import { PropsWithChildren, useEffect, useState } from "react";
import { useRecoilState } from "recoil";
import { getInitialPreloadedQuery, getRelayProps } from "relay-nextjs/app";
import "../styles/globals.css";
import Providers from "./Providers";
import { resetPage } from "./datasets/[slug]/samples/dynamicRouting/usePage";
import { loading as loadingState } from "./state";

// only import global-agent on the server
if (typeof window === "undefined") {
  require("global-agent").bootstrap();
}

const { MainLayout, MainColumn, MainBar } = layout;

const initialPreloadedQuery = getInitialPreloadedQuery({
  createClientEnvironment: getTeamsClientEnvironment,
});

const match = RegExp("/datasets/.*/samples");

function MyApp({ Component, ...props }: AppProps) {
  const relayProps = getRelayProps(props.pageProps, initialPreloadedQuery);
  // todo: add support for custom layout
  const {
    hideFooter,
    containerProps = {},
    topNavProps = {},
    signOutPage,
  } = Component.getLayoutProps ? Component.getLayoutProps() : {};

  if (signOutPage) return <Component />;

  return (
    <Providers environment={relayProps.preloadedQuery?.environment}>
      <ClientSide>
        <AppContainer {...props}>
          <MainLayout>
            <MainColumn>
              <MainBar>
                <MainTitle {...topNavProps} />
                <AppAlert {...props} />
              </MainBar>
              <Box minHeight="calc(100vh - 252px)" {...containerProps}>
                <Component {...props.pageProps} {...relayProps} />
              </Box>
              <AnalyticsConsent />
              {!hideFooter && <Footer />}
            </MainColumn>
          </MainLayout>
        </AppContainer>
      </ClientSide>
    </Providers>
  );
}

// Required for AppContainer to use recoil
function ClientSide({ children }: { children: JSX.Element }) {
  const [init, setInit] = useState(false);

  useEffect(() => {
    setInit(true);
  }, []);

  if (!init) return null;

  return children;
}

function AppContainer({ children, ...props }: PropsWithChildren) {
  const { token } = props?.pageProps || {};
  const [user] = useCurrentUser();
  const org = useCurrentOrganization();

  const router = useRouter();
  const asPath = router.asPath;
  const pathname = router.pathname;
  const [loading, setLoading] = useRecoilState(loadingState);

  // Enable service worker server-side, but also use client-side to check
  // to prevent client from getting stuck in a error state if things go wrong
  const isServiceWorkerEnabled =
    useEnv(FIFTYONE_APP_SERVICE_WORKER_ENABLED) === "true" &&
    sessionStorage?.getItem("serviceWorkerStatus") !== "disabled";

  const doNotTrackLocalStorage =
    localStorage?.getItem(FIFTYONE_DO_NOT_TRACK_LS) === "true";

  const isAnonymousAnaltyicsEnabled = useBooleanEnv(
    FIFTYONE_APP_ANONYMOUS_ANALYTICS_ENABLED,
    true
  );

  const doNotTrack = doNotTrackLocalStorage || !isAnonymousAnaltyicsEnabled;

  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);
  const ready =
    useInitializeApp(props) &&
    ((isServiceWorkerEnabled && isServiceWorkerReady) ||
      !isServiceWorkerEnabled);

  const SEGMENT_WRITE_KEY = useEnv(FIFTYONE_APP_SEGMENT_WRITE_KEY);

  const version = useProductVersion();
  const [analyticsInfo, setAnalyticsInfo] = useAnalyticsInfo();
  const analytics = usingAnalytics(analyticsInfo);
  const demoMode = useBooleanEnv(FIFTYONE_APP_DEMO_MODE);

  useEffect(() => {
    console.log("pathname", pathname);
    console.log("token", token);
    window.FIFTYONE_SEGMENT_WRITE_KEY = SEGMENT_WRITE_KEY;
    setAnalyticsInfo({
      writeKey: SEGMENT_WRITE_KEY,
      userId: demoMode ? user?.id : undefined,
      userGroup: demoMode ? org?.displayName : undefined,
      redact: !demoMode ? ["uri"] : undefined,
      disableUrlTracking: !demoMode,
      version,
      doNotTrack,
    });
    if (isServiceWorkerEnabled) {
      registerServiceWorker(pathname, token).then(() => {
        setIsServiceWorkerReady(true);
      });
    } else {
      deregisterAllServiceWorkers();
    }
  }, [isServiceWorkerEnabled, pathname]);

  useEffect(() => {
    router.events.on("routeChangeStart", () => {
      setLoading(true);
    });
    router.events.on("routeChangeComplete", () => {
      analytics.page();
      setLoading(false);
      const onSamplesPage = match.test(window.location.pathname);
      !onSamplesPage && resetPage();
    });
  }, [router.events, setLoading]);

  if (!ready) return null;

  return (
    <ErrorBoundary
      key={asPath}
      onReset={() => {
        window.location.reload();
      }}
    >
      {loading && (
        <Box
          sx={{
            position: "fixed",
            width: "100%",
            zIndex: (theme) => theme.zIndex.tooltip * 2,
          }}
        >
          <Pending />
        </Box>
      )}
      {children}
    </ErrorBoundary>
  );
}

export default MyApp;
