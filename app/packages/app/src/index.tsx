import { ErrorBoundary, Loading, ThemeProvider } from "@fiftyone/components";
import { usePlugins } from "@fiftyone/plugins";
import { BeforeScreenshotContext, screenshotCallbacks } from "@fiftyone/state";
import { SnackbarProvider } from "notistack";
import React from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot } from "recoil";
import Network from "./Network";
import "./index.css";
import { useRouter } from "./routing";

const App: React.FC = () => {
  const { context, environment } = useRouter();

  const plugins = usePlugins();
  if (plugins.isLoading) return <Loading>Pixelating...</Loading>;
  if (plugins.hasError) return <Loading>Plugin error...</Loading>;

  return <Network environment={environment} context={context} />;
};

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <RecoilRoot>
    <ThemeProvider>
      <ErrorBoundary>
        <BeforeScreenshotContext.Provider value={screenshotCallbacks}>
          <SnackbarProvider>
            <App />
          </SnackbarProvider>
        </BeforeScreenshotContext.Provider>
      </ErrorBoundary>
    </ThemeProvider>
  </RecoilRoot>
);
