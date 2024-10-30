import { Layout, TabConfig } from "./Layout";
import React, { Fragment, useEffect, useState } from "react";
import { EmptyState } from "./EmptyState";
import { LensConfigManager } from "./LensConfigManager";
import { LensPanel } from "./LensPanel";
import {
  LensConfig,
  ListLensConfigsRequest,
  ListLensConfigsResponse,
  OperatorResponse,
} from "./models";
import { useOperatorExecutor } from "@fiftyone/operators";
import { Snackbar } from "@mui/material";

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
  const [lensConfigs, setLensConfigs] = useState<LensConfig[]>([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeTab, setActiveTab] = useState<TabId>("empty-state");

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

  const listConfigsOperator = useOperatorExecutor(
    "@voxel51/operators/lens_list_lens_configs"
  );

  // Load configs on initial render
  useEffect(() => {
    const request: ListLensConfigsRequest = {};

    const callback = (response: OperatorResponse<ListLensConfigsResponse>) => {
      if (!(response.error || response.result?.error)) {
        const configs = response.result?.configs ?? [];
        handleLensConfigsUpdate(configs);
      } else {
        setErrorMessage(response.error || response.result?.error);
      }
    };

    listConfigsOperator.execute(request, { callback });
  }, []);

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

  const errorContent = errorMessage ? (
    <Snackbar
      open={!!errorMessage}
      onClose={() => setErrorMessage(null)}
      message={errorMessage}
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
