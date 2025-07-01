import { ErrorBoundary, ThemeProvider } from "@fiftyone/components";
import { BeforeScreenshotContext, screenshotCallbacks } from "@fiftyone/state";
import { SnackbarProvider } from "notistack";
import type React from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot } from "recoil";
import Network from "./Network";
import "./index.css";
import { useRouter } from "./routing";

// In your App.tsx or similar entry point
import { TestHarness } from '@fiftyone/operators'; // Import your harness

const App: React.FC = () => {
  return <TestHarness />;
}

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
