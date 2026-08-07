/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export type ScopeId = string;

export const ROOT_SCOPE = "app";

/**
 * The scope tree from the design doc §4.2, plus a `demo.*` subtree the
 * showcase route uses. Child → parent; `app` is the root and always active.
 *
 * Scope depth is the *primary* precedence axis (§4.3): a binding in a deeper
 * active scope wins over one in a shallower scope, so `priority` numbers stop
 * being the only mechanism and become an intra-scope tiebreak. Depth is derived
 * from where the user actually is, which is why it beats a number someone
 * picked.
 */
export const SCOPE_PARENTS: Record<ScopeId, ScopeId | null> = {
  app: null,

  grid: "app",
  "grid.selection": "grid",

  modal: "app",
  "modal.video": "modal",
  "modal.3d": "modal",
  "modal.group": "modal",
  "modal.annotate": "modal",
  "modal.annotate.segmentation": "modal.annotate",
  "modal.annotate.3d": "modal.annotate",

  "panel.embeddings": "app",
  "panel.map": "app",
  viewbar: "app",
  "overlay.operator-browser": "app",

  // Showcase-only scopes, so the demo route exercises the real resolution path
  // rather than a parallel toy one.
  demo: "app",
  "demo.canvas": "demo",
  "demo.canvas.tool": "demo.canvas",
  "demo.inspector": "demo",
};

/** Human labels for the settings pane and the demo readout. */
export const SCOPE_LABELS: Record<ScopeId, string> = {
  app: "Application",
  grid: "Grid",
  "grid.selection": "Grid ▸ Selection",
  modal: "Sample viewer",
  "modal.video": "Sample viewer ▸ Video",
  "modal.3d": "Sample viewer ▸ 3D",
  "modal.group": "Sample viewer ▸ Group",
  "modal.annotate": "Annotate",
  "modal.annotate.segmentation": "Annotate ▸ Segmentation",
  "modal.annotate.3d": "Annotate ▸ 3D",
  "panel.embeddings": "Embeddings panel",
  "panel.map": "Map panel",
  viewbar: "View bar",
  "overlay.operator-browser": "Operator browser",
  demo: "Demo ▸ Page",
  "demo.canvas": "Demo ▸ Canvas",
  "demo.canvas.tool": "Demo ▸ Canvas ▸ Tool",
  "demo.inspector": "Demo ▸ Inspector",
};

export const scopeLabel = (scope: ScopeId): string =>
  SCOPE_LABELS[scope] ?? scope;

/** The scope and all its ancestors, innermost first. */
export const scopeChain = (scope: ScopeId): ScopeId[] => {
  const chain: ScopeId[] = [];
  let current: ScopeId | null | undefined = scope;
  while (current) {
    chain.push(current);
    current = SCOPE_PARENTS[current];
  }
  return chain;
};

/** Distance from the root; the primary precedence key. */
export const scopeDepth = (scope: ScopeId): number =>
  scopeChain(scope).length - 1;

/** True when `ancestor` is a strict ancestor of `scope`. */
export const isAncestorScope = (ancestor: ScopeId, scope: ScopeId): boolean =>
  ancestor !== scope && scopeChain(scope).includes(ancestor);

/**
 * A scope is reachable when it and every ancestor are pushed. Pushing a leaf
 * without its parent is a bug, so this is what the pane means by "not
 * currently active".
 */
export const isScopeReachable = (
  scope: ScopeId,
  activeScopes: ReadonlySet<ScopeId>,
): boolean => scopeChain(scope).every((entry) => activeScopes.has(entry));
