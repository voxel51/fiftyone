import { MainPanel } from "./MainPanel";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { Box } from "@mui/material";

export const PanelWrapper = () => {
  return (
    <ErrorBoundary
      fallback={
        <Box sx={{ mt: 6 }}>
          <EmptyState disabled={true} />
        </Box>
      }
    >
      <MainPanel />
    </ErrorBoundary>
  );
};
