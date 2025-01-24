import React, { useEffect, useMemo, useState } from "react";
import { EmptyState } from "./EmptyState";
import Error from "./Error";
import { useLensConfigs } from "./hooks";
import { Layout, TabConfig } from "./Layout";
import { LensConfigManager } from "./LensConfigManager";
import { LensPanel } from "./LensPanel";
import { LensConfig } from "./models";

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
  const [hasDefaultTabBeenSet, setHasDefaultTabBeenSet] = useState(false);
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

  // If the panel was just opened and we have lens configs available, we want
  //   to default to the "query-data" tab rather than the "empty-state".
  useEffect(() => {
    if (hasDefaultTabBeenSet) {
      return;
    }

    if (activeTab !== "empty-state") {
      // We've already switched tabs; don't override the user's actions.
      setHasDefaultTabBeenSet(true);
      return;
    }

    // if we have lens configs, show the query data tab by default
    if (lensConfigs.length > 0) {
      setActiveTab("query-data");
      setHasDefaultTabBeenSet(true);
    }
  }, [activeTab, lensConfigs, hasDefaultTabBeenSet]);

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
