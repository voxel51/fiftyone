/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ThemeProvider } from "@fiftyone/components";
import { OperatorCore } from "@fiftyone/operators";
import { BaseStylesProvider } from "@fiftyone/operators/src/styled-components";
import { PluginRuntimeHostContextProvider } from "../context";
import {
  PluginRuntimeLoadingCard,
  PluginRuntimeLoadingScreen,
} from "./Loading";
import { usePluginOperatorsRuntime } from "./operators";
import { usePluginRuntimeStatus } from "./status";
import type {
  PluginRuntimeHostContext,
  PluginsLoaderProps,
  PluginsRuntimeProps,
} from "./types";
import usePlugins from "./usePlugins";

export function PluginsLoader({
  blockWhileLoading = true,
  children,
}: PluginsLoaderProps) {
  const plugins = usePlugins();

  if (blockWhileLoading && plugins.isLoading)
    return <PluginRuntimeLoadingScreen />;

  return <>{children}</>;
}

export function OperatorsRuntime(props: PluginsRuntimeProps) {
  const { operatorContextSelector, useSpacesContext } = props;
  const hostContext: Partial<PluginRuntimeHostContext> = {
    operatorContextSelector,
    useSpacesContext,
  };

  return (
    <PluginRuntimeHostContextProvider value={hostContext}>
      <OperatorsRuntimeContent {...props} />
    </PluginRuntimeHostContextProvider>
  );
}

function OperatorsRuntimeContent(props: PluginsRuntimeProps) {
  const {
    activeScope,
    blocking = false,
    children,
    datasetLess,
    datasetName,
  } = props;

  usePluginOperatorsRuntime(activeScope, datasetName, datasetLess);
  const { hasError, isLoading, ready } = usePluginRuntimeStatus();

  if (blocking && isLoading) {
    return <PluginRuntimeLoadingScreen />;
  }

  return (
    <>
      {!isLoading && (
        <ThemeProvider>
          <BaseStylesProvider>
            <OperatorCore />
          </BaseStylesProvider>
        </ThemeProvider>
      )}
      {children}
      {!blocking && !ready && !hasError && <PluginRuntimeLoadingCard />}
    </>
  );
}

export default function PluginsRuntime(props: PluginsRuntimeProps) {
  return (
    <PluginsLoader blockWhileLoading={props.blocking ?? false}>
      <OperatorsRuntime {...props} />
    </PluginsLoader>
  );
}
