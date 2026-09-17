/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ThemeProvider } from "@fiftyone/components";
import ErrorBoundary from "./components/ErrorBoundary";
import {
  GatedDynamicImports,
  type GatedDynamicImport,
} from "@fiftyone/core/src/components/GatedDynamicImports";
import {
  LocationProvider,
  createLocationStore,
  locationBridge,
} from "@fiftyone/location";
import { BeforeScreenshotContext, screenshotCallbacks } from "@fiftyone/state";
import { SnackbarProvider } from "notistack";
import type React from "react";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ReverbRoot } from "@fiftyone/reverb";
import Network from "./Network";
import "./index.css";
import "@voxel51/voodo/theme.css";
import { appRoutes } from "./location/routes";
import { historyAdapter } from "./location/historyAdapter";
import { useRouter } from "./routing";

if (
  process.env.NODE_ENV === "development" &&
  import.meta.env.VITE_DEV_WORKTREE_NAME
) {
  document.title = `${document.title} (${import.meta.env.VITE_DEV_WORKTREE_NAME})`;
}

/**
 * Register future feature-gated modules here.
 */
const GATED_DYNAMIC_IMPORTS: GatedDynamicImport[] = [];

// Dynamically import multimodal to keep its heavy dependencies out of the
// app's initial bundle.
import("@fiftyone/multimodal/inject").catch((error) => {
  console.warn("Failed to register module: multimodal", error);
});

const App: React.FC = () => {
  const { context, environment } = useRouter();

  // Built from the router's own history instance, so both writers notify one
  // store — and a notebook's memory history works the same as a browser's.
  // Attached to the bridge so the inputs that are not clicks, a server-pushed
  // state change or an operator, write through the path a click does.
  const location = useMemo(() => {
    const store = createLocationStore(
      historyAdapter(context.history),
      appRoutes,
    );
    locationBridge.attach(store);
    return store;
  }, [context]);

  return (
    <LocationProvider store={location}>
      <GatedDynamicImports gatedImports={GATED_DYNAMIC_IMPORTS} />
      <Network environment={environment} context={context} />
    </LocationProvider>
  );
};

// Render once the web font is in: text laid out in the fallback font keeps
// its metrics after the swap. A font that fails to load, or is slow to,
// renders the fallback rather than holding a blank page.
const FONT_WAIT_MS = 1500;

Promise.race([
  document.fonts.load('1em "Palanquin"').catch(() => undefined),
  new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
]).then(() => renderApp());

const renderApp = () =>
  createRoot(document.getElementById("root") as HTMLDivElement).render(
    <ReverbRoot>
      <ThemeProvider>
        <ErrorBoundary>
          <BeforeScreenshotContext.Provider value={screenshotCallbacks}>
            <SnackbarProvider>
              <App />
            </SnackbarProvider>
          </BeforeScreenshotContext.Provider>
        </ErrorBoundary>
      </ThemeProvider>
    </ReverbRoot>,
  );
