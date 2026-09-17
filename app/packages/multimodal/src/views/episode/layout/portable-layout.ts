import type { MosaicNode } from "react-mosaic-component";
import {
  sanitizeModalLayout,
  type PersistedCameraPreferences,
  type PersistedModalLayout,
} from "./layout-persistence";
import {
  normalizeSidebarPreferences,
  type SidebarPreferences,
} from "../settings/sidebar-preferences";

/** Shared payload limit for capture, file import, and library storage. */
export const MAX_PORTABLE_LAYOUT_BYTES = 262_144;
const FORMAT = "fiftyone.multimodal-layout";

/** Durable settings for the selected media field; no dataset or recording IDs. */
export interface PortableLayout {
  readonly format: typeof FORMAT;
  readonly version: 1;
  readonly modal: Omit<
    PersistedModalLayout,
    "cameraPreferences" | "defaultCameraPreferences" | "expandedTileId"
  >;
  readonly camera: PersistedCameraPreferences;
  readonly preferences: SidebarPreferences;
}

/** Captures only the durable fields of the shared persistence format. */
export function serializePortableLayout(
  modal: PersistedModalLayout,
  camera: PersistedCameraPreferences,
  preferences: SidebarPreferences,
): string {
  const {
    cameraPreferences: _camera,
    defaultCameraPreferences: _defaultCamera,
    expandedTileId: _expanded,
    ...durable
  } = modal;
  const json = JSON.stringify({
    format: FORMAT,
    version: 1,
    modal: sanitizeModalLayout(durable),
    camera,
    preferences,
  });
  // Capture and import share validation, including the payload budget.
  parsePortableLayout(json);
  return json;
}

/** Validates external data before any browser state is changed. */
export function parsePortableLayout(json: string): PortableLayout {
  if (new TextEncoder().encode(json).length > MAX_PORTABLE_LAYOUT_BYTES) {
    throw new Error("Layout files must be 256 KiB or smaller.");
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("The layout file is not valid JSON.");
  }
  validateJsonBudget(value);
  if (!isRecord(value) || value.format !== FORMAT) {
    throw new Error("Choose a FiftyOne multimodal layout file.");
  }
  if (value.version !== 1)
    throw new Error("This layout version is not supported.");
  if (
    Object.keys(value).some(
      (key) =>
        !["format", "version", "modal", "camera", "preferences"].includes(key),
    )
  ) {
    throw new Error("The layout contains unsupported fields.");
  }
  if (!isRecord(value.modal) || !isRecord(value.camera))
    throw new Error("The layout settings are invalid.");
  validateTree(value.modal.layout);
  if (
    "cameraPreferences" in value.modal ||
    "defaultCameraPreferences" in value.modal ||
    "expandedTileId" in value.modal
  ) {
    throw new Error("The layout contains nonportable viewer state.");
  }
  const modal = sanitizeModalLayout(value.modal);
  const preferences = normalizeSidebarPreferences(value.preferences);
  const camera =
    sanitizeModalLayout({ cameraPreferences: { field: value.camera } })
      ?.cameraPreferences?.field ?? {};
  // Sanitizers are intentionally forgiving for old browser storage. Imports
  // must instead reject unsupported or malformed fields, without partial apply.
  if (
    !modal ||
    !preferences ||
    !sameJson(modal, value.modal) ||
    !sameJson(camera, value.camera) ||
    !sameJson(preferences, value.preferences)
  ) {
    throw new Error("The layout contains invalid or unsupported settings.");
  }
  return { format: FORMAT, version: 1, modal, camera, preferences };
}

/**
 * Identity of the user-authored settings in a valid layout, for change
 * detection. Independent of key order and omitted `undefined` fields.
 *
 * Camera navigation compositions and the renderable-source gate are excluded
 * on purpose: the 3D camera re-expresses them from the live pose whenever a
 * restore resolves, bounds arrive, or frame conventions change, so their
 * numbers differ after a clean load without any user action. Deliberate
 * camera choices (up axis, world frame, tracking mode, navigation mode) are
 * still compared. Captures always carry the full compositions, so saving
 * publishes the current camera view regardless.
 */
export function portableLayoutChangeKey(json: string): string {
  const layout = parsePortableLayout(json);
  return JSON.stringify(
    canonicalJson({
      ...layout,
      preferences: {
        ...layout.preferences,
        camera: {
          cameraNavigationMode: layout.preferences.camera.cameraNavigationMode,
        },
      },
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalJson(value[key])]),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
  );
}

function validateJsonBudget(value: unknown): void {
  let nodes = 0;
  const visit = (node: unknown, depth: number) => {
    if (++nodes > 16_384 || depth > 24)
      throw new Error("The layout is too complex.");
    if (typeof node === "string" && node.length > 8_192)
      throw new Error("A layout setting is too long.");
    if (typeof node === "number" && !Number.isFinite(node))
      throw new Error("A layout number is invalid.");
    if (Array.isArray(node)) node.forEach((child) => visit(child, depth + 1));
    else if (isRecord(node)) {
      for (const [key, child] of Object.entries(node)) {
        if (
          key.length > 1_100 ||
          ["__proto__", "prototype", "constructor"].includes(key)
        )
          throw new Error("A layout key is invalid.");
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
}

function validateTree(
  tree: unknown,
): asserts tree is MosaicNode<string> | null {
  const ids = new Set<string>();
  const visit = (node: unknown, depth: number): void => {
    if (depth > 16) throw new Error("The layout has too many nested splits.");
    if (typeof node === "string") {
      if (
        !node ||
        node.length > 256 ||
        ids.has(node) ||
        ids.size >= 64 ||
        node.lastIndexOf("-") <= 0
      )
        throw new Error("The layout has invalid or duplicate tiles.");
      ids.add(node);
      return;
    }
    if (
      !isRecord(node) ||
      !["row", "column"].includes(String(node.direction)) ||
      Object.keys(node).some(
        (key) =>
          !["direction", "first", "second", "splitPercentage"].includes(key),
      ) ||
      (node.splitPercentage !== undefined &&
        (typeof node.splitPercentage !== "number" ||
          node.splitPercentage < 0 ||
          node.splitPercentage > 100))
    )
      throw new Error("The tile arrangement is invalid.");
    visit(node.first, depth + 1);
    visit(node.second, depth + 1);
  };
  if (tree !== null) visit(tree, 0);
}
