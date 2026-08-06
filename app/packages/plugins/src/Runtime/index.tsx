/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Loading, ThemeProvider } from "@fiftyone/components";
import { OperatorCore } from "@fiftyone/operators";
import { BaseStylesProvider } from "@fiftyone/operators/src/styled-components";
import { PluginRuntimeHostContextProvider } from "../context";
import { usePluginOperatorsRuntime } from "./operators";
import type {
  PluginRuntimeHostContext,
  PluginsLoaderProps,
  PluginsRuntimeProps,
} from "./types";
import usePlugins, { usePluginsStatus } from "./usePlugins";

export function PluginsLoader({
  blockWhileLoading = true,
  children,
}: PluginsLoaderProps) {
  const plugins = usePlugins();

  if (blockWhileLoading && plugins.isLoading)
    return <Loading>Pixelating...</Loading>;

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
  const { activeScope, children, datasetLess, datasetName } = props;

  const plugins = usePluginsStatus();
  const operators = usePluginOperatorsRuntime(
    activeScope,
    datasetName,
    datasetLess,
  );

  if (plugins.isLoading || operators.isLoading) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <>
      <ThemeProvider>
        <BaseStylesProvider>
          <OperatorCore />
        </BaseStylesProvider>
      </ThemeProvider>
      {children}
    </>
  );
}

export default function PluginsRuntime(props: PluginsRuntimeProps) {
  return (
    <PluginsLoader>
      <OperatorsRuntime {...props} />
    </PluginsLoader>
  );
}
