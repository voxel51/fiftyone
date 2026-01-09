/// <reference types="./env.d.ts" />
import { ErrorBoundary, ThemeProvider } from "@fiftyone/components";
import { BeforeScreenshotContext, screenshotCallbacks } from "@fiftyone/state";
import { SnackbarProvider } from "notistack";
import type React from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot } from "recoil";
import Network from "./Network";
import "./index.css";
import { useRouter } from "./routing";

if (process.env.NODE_ENV === "development" && import.meta.env.VITE_DEV_WORKTREE_NAME) {
  document.title = `${document.title} (${import.meta.env.VITE_DEV_WORKTREE_NAME})`;
}

const App: React.FC = () => {
  const { context, environment } = useRouter();

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
