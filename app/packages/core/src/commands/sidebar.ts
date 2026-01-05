/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Command, getCommandBus } from "@fiftyone/commands";

/**
 * Command to expand a field in the grid sidebar.
 */
export class ExpandFieldInGridCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to expand a field in the modal sidebar.
 */
export class ExpandFieldInModalCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to scroll to a field in the grid sidebar.
 */
export class ScrollToFieldInGridCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to scroll to a field in the modal sidebar.
 */
export class ScrollToFieldInModalCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to collapse a field in the grid sidebar.
 */
export class CollapseFieldInGridCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to collapse a field in the modal sidebar.
 */
export class CollapseFieldInModalCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to expand and scroll to a field in the grid sidebar.
 */
export class ExpandAndScrollToFieldInGridCommand extends Command<void> {
  constructor(public readonly path: string) {
    super();
  }
}

/**
 * Command to expand and scroll to a field in the modal sidebar.
 */
export class ExpandAndScrollToFieldInModalCommand extends Command<void> {
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
 * Dispatches the appropriate command via the command bus based on modal parameter.
 *
 * @param path - The field path to expand
 * @param modal - Whether to target modal sidebar (true) or grid sidebar (false, default)
 */
export const requestExpandField = (path: string, modal: boolean = false) => {
  const bus = getCommandBus();
  const Command = modal ? ExpandFieldInModalCommand : ExpandFieldInGridCommand;
  return bus.execute(new Command(path));
};

/**
 * Request to scroll to a field in the sidebar.
 * Dispatches the appropriate command via the command bus based on modal parameter.
 *
 * @param path - The field path to scroll to
 * @param modal - Whether to target modal sidebar (true) or grid sidebar (false, default)
 */
export const requestScrollToField = (path: string, modal: boolean = false) => {
  const bus = getCommandBus();
  const Command = modal
    ? ScrollToFieldInModalCommand
    : ScrollToFieldInGridCommand;
  return bus.execute(new Command(path));
};

/**
 * Request to collapse a field in the sidebar.
 * Dispatches the appropriate command via the command bus based on modal parameter.
 *
 * @param path - The field path to collapse
 * @param modal - Whether to target modal sidebar (true) or grid sidebar (false, default)
 */
export const requestCollapseField = (path: string, modal: boolean = false) => {
  const bus = getCommandBus();
  const Command = modal
    ? CollapseFieldInModalCommand
    : CollapseFieldInGridCommand;
  return bus.execute(new Command(path));
};

/**
 * Request to expand and scroll to a field in the sidebar.
 * Dispatches the appropriate command via the command bus based on modal parameter.
 *
 * @param path - The field path to expand and scroll to
 * @param modal - Whether to target modal sidebar (true) or grid sidebar (false, default)
 */
export const requestExpandAndScrollToField = (
  path: string,
  modal: boolean = false
) => {
  const bus = getCommandBus();
  const Command = modal
    ? ExpandAndScrollToFieldInModalCommand
    : ExpandAndScrollToFieldInGridCommand;
  return bus.execute(new Command(path));
};
