import { Layout, TabConfig } from "./Layout";
import React, { useMemo, useState } from "react";
import { EmptyState } from "./EmptyState";
import { LensConfigManager } from "./LensConfigManager";
import { LensPanel } from "./LensPanel";
import { LensConfig } from "./models";
import { useLensConfigs } from "./hooks";
import Error from "./Error";

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
            onError={setErrorMessage}
          />
        ),
        isVisible: true,
      },
    ]
  );

  const errors = useMemo(() => {
    return [lensConfigError, errorMessage].filter((s) => !!s);
  }, [lensConfigError, errorMessage]);

  return (
    <>
      <Layout
        tabs={tabs.filter((tab) => tab.isVisible)}
        active={activeTab}
        onTabClick={(tabId) => setActiveTab(tabId as TabId)}
      />
      <Error errors={errors} onClear={clearErrors} />
    </>
  );
};
