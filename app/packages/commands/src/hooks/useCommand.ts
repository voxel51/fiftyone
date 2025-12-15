/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { getCommandRegistry } from "../registry";
import { Command } from "../types";

/**
 * Returns a command that is already registered by a parent
 * component.  It does not unregister it on unmount.
 * @param id The id of an already registered command
 */
export const useCommand = (id: string) => {
  /**
   * TODO
   */
};
