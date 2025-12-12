/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useEffect } from "react";
import { getCommandRegistry } from "../registry";
import { Command } from "../types";

/**
 * Hook to create a new command bound to the component's lifecycle.
 * This command is unregistered on unmount.
 * @param id The command id
 * @param execute The function to execute when the command is invoked
 * @param undo Optional undo command that is invoked on undo
 * @param label Optional label to describe the command, ie Save, Delete, etc
 * @param description A longer form description.  Think of a tool tip.
 * @param enablement The function that determines if the command is enabled or not.
 * @returns The command instance.
 */
export const useNewCommand = async (
  id: string,
  execute: () => Promise<void>,
  undo?: () => Promise<void>,
  label?: string,
  description?: string,
  enablement?: () => boolean
): Promise<Command | undefined> => {
  const registry = getCommandRegistry();
  const command = await registry.registerCommand(
    id,
    execute,
    undo,
    label,
    description,
    enablement
  );
  useEffect(() => {
    if (command) {
      return () => {
        registry.unregisterCommand(id);
      };
    }
  });
  return command;
};
