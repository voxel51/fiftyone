/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Command, getCommandBus } from "@fiftyone/commands";

/**
 * Command to expand a field in the sidebar.
 */
export class ExpandFieldCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to scroll to a field in the sidebar.
 */
export class ScrollToFieldCommand extends Command<void> {
  constructor(public readonly path: string, public readonly eventId?: string) {
    super();
  }
}

/**
 * Command to collapse a field in the sidebar.
 */
export class CollapseFieldCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to expand and scroll to a field in the sidebar.
 */
export class ExpandAndScrollToFieldCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * ============================================================================
 * CONVENIENCE WRAPPERS
 * ============================================================================
 */

/**
 * Request to expand a field in the sidebar.
 * Dispatches ExpandFieldCommand via the command bus.
 */
export const requestExpandField = (path: string) => {
  const bus = getCommandBus();
  return bus.execute(new ExpandFieldCommand(path));
};

/**
 * Request to scroll to a field in the sidebar.
 * Dispatches ScrollToFieldCommand via the command bus.
 */
export const requestScrollToField = (path: string, eventId?: string) => {
  const bus = getCommandBus();
  return bus.execute(new ScrollToFieldCommand(path, eventId));
};

/**
 * Request to collapse a field in the sidebar.
 * Dispatches CollapseFieldCommand via the command bus.
 */
export const requestCollapseField = (path: string) => {
  const bus = getCommandBus();
  return bus.execute(new CollapseFieldCommand(path));
};

/**
 * Request to expand and scroll to a field in the sidebar.
 * Dispatches ExpandAndScrollToFieldCommand via the command bus.
 */
export const requestExpandAndScrollToField = (path: string) => {
  const bus = getCommandBus();
  return bus.execute(new ExpandAndScrollToFieldCommand(path));
};
