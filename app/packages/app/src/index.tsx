import { ErrorBoundary, Loading, ThemeProvider } from "@fiftyone/components";
import { usePlugins } from "@fiftyone/plugins";
import {
  BeforeScreenshotContext,
  modal,
  screenshotCallbacks,
} from "@fiftyone/state";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot, useRecoilValue } from "recoil";
import Network from "./Network";

import "./index.css";
import { useRouter } from "./routing";

const App: React.FC = () => {
  const isModalActive = Boolean(useRecoilValue(modal));
  const { context, environment } = useRouter();

  useEffect(() => {
    document
      .getElementById("modal")
      ?.classList.toggle("modalon", isModalActive);
  }, [isModalActive]);

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
          <App />
        </BeforeScreenshotContext.Provider>
      </ErrorBoundary>
    </ThemeProvider>
  </RecoilRoot>
);
