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

/**
 * Entry point for Data Lens panel.
 *
 * This component is responsible for panel initialization and content
 *   management.
 */
export const MainPanel = () => {
  const [lensConfigs, setLensConfigs] = useState<LensConfig[]>([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Tabs declared here to allow programmatic navigation below.
  const tabs: TabConfig[] = [];

  // Handler for switching tabs.
  // tab.id is used as a canonical reference to a tab.
  const switchToTab = (tabId: string) => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index >= 0 && index < tabs.length) {
      setActiveTab(index);
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
      },
      {
        id: "query-data",
        label: "Query data",
        content: (
          <LensPanel
            lensConfigs={lensConfigs}
            onError={setErrorMessage}
            switchToTab={switchToTab}
          />
        ),
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
      <Layout tabs={tabs} active={activeTab} onTabClick={setActiveTab} />
      {errorContent}
    </>
  );
};
