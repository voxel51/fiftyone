import type {
  EpisodeSelection,
  SelectionBoundary,
  SelectionCounts,
  SelectionMember,
} from "@fiftyone/state/src/selection/types";
import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
import { createExtensionRegistry } from "../host/registry";

/** Dataset and effective membership supplied to every contributed action. */
export interface GridSelectionActionContext {
  readonly datasetId: string;
  readonly mediaType: string;
  readonly source: "explicit" | "results";
  readonly counts: SelectionCounts;
  readonly groups: readonly EpisodeSelection[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly boundary: SelectionBoundary;
  /** Resolves the complete scope, including unloaded and out-of-results members. */
  readonly resolve: () => Promise<readonly SelectionMember[]>;
}

/** An action owns its scope policy and availability in either toolbar location. */
export interface GridSelectionAction {
  readonly id: `${string}:${string}`;
  readonly order: number;
  readonly label: string;
  readonly placement: "primary" | "more";
  readonly supports: (mediaType: string) => boolean;
  readonly scope: "explicit" | "explicit-or-results";
  readonly memberKinds: readonly SelectionMember["kind"][];
  /** Return a reason when the complete scope cannot be handled. */
  readonly unavailable?: (context: GridSelectionActionContext) => string | null;
  readonly Component: ComponentType<{
    context: GridSelectionActionContext;
    disabledReason: string | null;
  }>;
}

/** A provider publishes complete candidates, never just loaded grid cards. */
export interface GridSegmentProvider {
  readonly id: `${string}:${string}`;
  readonly order: number;
  readonly label: string;
  readonly supports: (mediaType: string) => boolean;
  readonly resolve: (
    datasetId: string,
    signal: AbortSignal,
  ) => Promise<readonly SelectionMember[]>;
}

const actions = createExtensionRegistry<GridSelectionAction>(
  Symbol.for("@fiftyone/grid-selection:actions"),
  "grid selection action",
);
const providers = createExtensionRegistry<GridSegmentProvider>(
  Symbol.for("@fiftyone/grid-selection:providers"),
  "grid segment provider",
);

/** Registers any top-level or overflow action. An empty registry is supported. */
export const registerGridSelectionAction = actions.register;
/** Registers a range source without coupling it to tray state or subset storage. */
export const registerGridSegmentProvider = providers.register;

/** Returns actions in stable order, reacting to registration and disposal. */
export function useGridSelectionActions() {
  return useSyncExternalStore(
    actions.subscribe,
    actions.getSnapshot,
    actions.getSnapshot,
  );
}

/** Returns available range providers; no provider is a normal empty result. */
export function useGridSegmentProviders() {
  return useSyncExternalStore(
    providers.subscribe,
    providers.getSnapshot,
    providers.getSnapshot,
  );
}

/** Enforce declared action scope before provider-specific availability. */
export function gridActionDisabledReason(
  action: GridSelectionAction,
  context: GridSelectionActionContext,
): string | null {
  if (context.loading) return "Resolving the complete scope";
  if (context.error) return context.error;
  if (!context.counts.episodes) return "No members in this scope";
  if (action.scope === "explicit" && context.source !== "explicit")
    return "Select episodes or segments first";
  if (
    context.groups.some((group) =>
      group.members.some((member) => !action.memberKinds.includes(member.kind)),
    )
  )
    return "This action does not support every selected member kind";
  return action.unavailable?.(context) ?? null;
}
