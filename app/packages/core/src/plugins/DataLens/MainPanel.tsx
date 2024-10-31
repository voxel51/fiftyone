import { Layout, TabConfig } from "./Layout";
import React, { Fragment, useState } from "react";
import { EmptyState } from "./EmptyState";
import { LensConfigManager } from "./LensConfigManager";
import { LensPanel } from "./LensPanel";
import { LensConfig } from "./models";
import { Snackbar, Stack, Typography } from "@mui/material";
import { useLensConfigs } from "./hooks";

type ExtendedTabConfig = TabConfig & {
  isVisible: boolean;
};

type TabId = "empty-state" | "query-data" | "manage-datasources";

/**
 * Entry point for Data Lens panel.
 *
 * This component is responsible for panel initialization and content
 *   management.
 */
export const MainPanel = () => {
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeTab, setActiveTab] = useState<TabId>("empty-state");
  const {
    lensConfigs,
    setLensConfigs,
    error: lensConfigError,
    clearError: clearLensConfigError,
  } = useLensConfigs();

  const clearErrors = () => {
    clearLensConfigError();
    setErrorMessage(null);
  };

  // Tabs declared here to allow programmatic navigation below.
  const tabs: ExtendedTabConfig[] = [];

  // Handler for switching tabs.
  // tab.id is used as a canonical reference to a tab.
  const switchToTab = (tabId: TabId) => {
    const isValidTab =
      tabs
        .filter((tab) => tab.isVisible)
        .findIndex((tab) => tab.id === tabId) >= 0;

    if (isValidTab) {
      setActiveTab(tabId);
    }
  };

  // Callback which handles updates to the list of available configs.
  const handleLensConfigsUpdate = (configs: LensConfig[]) => {
    configs.sort((a, b) => a.name.localeCompare(b.name));
    setLensConfigs(configs);
  };

  tabs.push(
    ...[
      {
        id: "empty-state",
        label: "Home",
        content: (
          <EmptyState
            onManageConfigsClick={() => switchToTab("manage-datasources")}
          />
        ),
        isVisible: true,
      },
      {
        id: "query-data",
        label: "Query data",
        content: (
          <LensPanel lensConfigs={lensConfigs} onError={setErrorMessage} />
        ),
        isVisible: lensConfigs.length > 0,
      },
      {
        id: "manage-datasources",
        label: "Data sources",
        content: (
          <LensConfigManager
            configs={lensConfigs}
            onConfigsChange={handleLensConfigsUpdate}
          />
        ),
        isVisible: true,
      },
    ]
  );

  const errors = [lensConfigError, errorMessage].filter((s) => !!s);

  const errorContent =
    errors.length > 0 ? (
      <Snackbar
        open={errors.length > 0}
        onClose={clearErrors}
        message={
          <Stack direction="column" spacing={2}>
            {errors.map((err, idx) => (
              <Typography key={idx} color="error">
                {err}
              </Typography>
            ))}
          </Stack>
        }
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    ) : (
      <Fragment />
    );

  return (
    <>
      <Layout
        tabs={tabs.filter((tab) => tab.isVisible)}
        active={activeTab}
        onTabClick={(tabId) => setActiveTab(tabId as TabId)}
      />
      {errorContent}
    </>
  );
};
