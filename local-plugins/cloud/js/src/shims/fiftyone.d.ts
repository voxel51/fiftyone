/**
 * The slice of the App's API this plugin uses.
 *
 * The `@fiftyone/*` packages resolve to the app monorepo's TypeScript
 * *sources*, which do not type-check standalone — they depend on relay
 * artifacts, catalog-resolved dependencies and a workspace-wide tsconfig.
 * Every one of them is externalized by the plugin build, so the plugin never
 * compiles them; declaring only what it calls keeps `tsc --noEmit` scoped to
 * this package while still type-checking the call sites.
 *
 * Keep in step with the App: a signature that drifts here fails at runtime,
 * not at build time.
 */

declare module "@fiftyone/operators" {
  export function useTriggerPanelEvent(): (
    uri: string,
    params?: Record<string, unknown>,
    prompt?: boolean,
    callback?: (result: { result?: unknown; error?: unknown }) => void,
  ) => void;

  export function useOperatorExecutor(
    uri: string,
    handlers?: Record<string, unknown>,
  ): {
    execute(params: Record<string, unknown>): void;
    isExecuting: boolean;
    hasExecuted: boolean;
    result: unknown;
    error: unknown;
    clear(): void;
  };
}

declare module "@fiftyone/plugins" {
  export enum PluginComponentType {
    Visualizer = 1,
    Plot = 2,
    Panel = 3,
    Component = 4,
  }

  export function registerComponent(registration: {
    name: string;
    label?: string;
    component: unknown;
    type: PluginComponentType;
    activator: (props: unknown) => boolean;
  }): void;
}

declare module "@fiftyone/spaces" {
  export function usePanelId(): string;
  export function usePanelStatePartial<T>(
    key: string,
    defaultState: T,
    local?: boolean,
    scope?: string,
  ): [T, (value: T | ((previous: T) => T)) => void];
}

declare module "@fiftyone/state" {
  import type { RecoilState } from "recoil";
  export const datasetId: RecoilState<string | undefined>;
  export const datasetName: RecoilState<string | undefined>;
}

declare module "@fiftyone/utilities" {
  export function getEventSource(
    path: string,
    events: {
      onmessage?: (event: { event?: string; data?: string }) => void;
      onopen?: () => void;
      onclose?: () => void;
      onerror?: (error: Error) => void;
    },
    signal: AbortSignal,
    body?: Record<string, unknown>,
  ): void;
}
