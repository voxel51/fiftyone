/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Loading } from "@fiftyone/components";
import { OperatorCore } from "@fiftyone/operators";
import { setContextHook, setContextSelector } from "../context";
import * as fos from "@fiftyone/state";
import { type PropsWithChildren } from "react";
import usePlugins from "./usePlugins";

type PluginsRuntimeProps = PropsWithChildren<{}>;

export default function PluginsRuntime(props: PluginsRuntimeProps) {
  const { children } = props;
  const plugins = usePlugins();

  setContextSelector("operators", fos.operatorContextSelector);
  setContextHook("spaces", fos.useSpacesContext);

  if (plugins.isLoading) return <Loading>Pixelating...</Loading>;

  return (
    <>
      <OperatorCore />
      {children}
    </>
  );
}
