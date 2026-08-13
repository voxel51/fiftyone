import { sanitizeBoundedStringList } from "../../../utils/bounded-string-list";
import { createTimestampLruScopedStore } from "../../../utils/scoped-store";
import {
  DEFAULT_PINHOLE_CAMERA,
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  DEFAULT_REFERENCE_GRID,
  DEFAULT_SCENE_BACKGROUND,
  normalizeImageProjection,
  normalizePinholeCamera,
  normalizePointCloudColor,
  normalizePointCloudPointSize,
  normalizeReferenceGrid,
  normalizeSceneBackground,
  type ImageProjectionSettings,
  type PersistedPointCloudColorSettings,
  type PinholeCameraSettings,
  type ReferenceGridSettings,
  type SceneBackgroundSettings,
} from "./modal/storage";
import {
  MAX_SEMANTIC_SOURCE_KEY_LENGTH,
  normalizeSemanticSourceKey,
  type SemanticSourceKey,
} from "./semantic-source";

export const SIDEBAR_PREFERENCES_STORAGE_KEY =
  "fiftyone.episode.sidebar-preferences.v1";
const STORAGE_VERSION = 1;
export const MAX_SIDEBAR_PREFERENCE_SCOPES = 20;
const MAX_SCOPE_LENGTH = 1_024;
const MAX_TILE_ID_LENGTH = 256;
const MAX_TILES = 64;
const MAX_SOURCES = 128;
const MAX_FRAME_ID_LENGTH = 512;
const MAX_CAMERA_COMPOSITIONS = 2;

export interface SidebarAppearancePreferences {
  readonly pinholeCamera: PinholeCameraSettings;
  readonly pointCloudPointSize: number;
  readonly referenceGrid: ReferenceGridSettings;
  readonly sceneBackground: SceneBackgroundSettings;
  readonly showPointCloudColorLegend: boolean;
}

export interface PersistedSemanticImageProjection extends Omit<
  ImageProjectionSettings,
  "calibrationStream" | "streams"
> {
  readonly calibrationStream: SemanticSourceKey | null;
  readonly streams: readonly SemanticSourceKey[] | null;
}

export interface PersistedImage3dLabelProjection {
  readonly enabled: boolean;
  readonly interpolate: boolean;
  readonly streams: readonly SemanticSourceKey[] | null;
}

export interface PersistedImagePointCloudProjection {
  readonly enabled: boolean;
  readonly pointSize: number;
  readonly streams: readonly SemanticSourceKey[] | null;
}

export interface PersistedScene3dTilePreferences {
  readonly cameraSelectionCustomized: boolean;
  readonly enabledSourceKeys: readonly SemanticSourceKey[];
  readonly primarySourceKey: SemanticSourceKey | null;
  readonly trajectoryFrameOverrides?: Readonly<
    Record<SemanticSourceKey, string>
  >;
}

export interface PersistedSidebarTilePreferences {
  readonly image3dLabelProjections?: Readonly<
    Record<SemanticSourceKey, PersistedImage3dLabelProjection>
  >;
  readonly imageLabelSourceKeys?: Readonly<
    Record<SemanticSourceKey, readonly SemanticSourceKey[]>
  >;
  readonly imagePointCloudProjections?: Readonly<
    Record<SemanticSourceKey, PersistedImagePointCloudProjection>
  >;
  readonly imageSourceKey?: SemanticSourceKey;
  readonly threeD?: PersistedScene3dTilePreferences;
}

export interface PersistedPortableCameraPreferences {
  readonly cameraNavigationMode: "absolute" | "relative";
  readonly navigationCompositions: readonly PersistedCameraComposition[];
  readonly renderableSourceKeys: readonly SemanticSourceKey[] | null;
}

export type PersistedCameraComposition =
  | {
      readonly distanceInRadii: number;
      readonly kind: "bounds-normalized";
      readonly sceneUpAxis: "x" | "y" | "z";
      readonly targetOffsetInRadii: readonly [number, number, number];
      readonly trackingMode: PersistedTrackingMode;
      readonly viewDirection: readonly [number, number, number];
    }
  | {
      readonly kind: "target-relative";
      readonly relativePosition: readonly [number, number, number];
      readonly relativeTarget: readonly [number, number, number];
      readonly rotationMode: "heading" | "pose" | "position";
      readonly sceneUpAxis: "x" | "y" | "z";
      readonly targetFrameId: string;
      readonly trackingMode: PersistedTrackingMode;
    };

type PersistedTrackingMode = "free" | "heading" | "pose" | "position";

export interface SidebarPreferences {
  readonly appearance: SidebarAppearancePreferences;
  readonly camera: PersistedPortableCameraPreferences;
  readonly imageProjection: Readonly<
    Record<SemanticSourceKey, PersistedSemanticImageProjection>
  >;
  readonly pointCloudColors: Readonly<
    Record<SemanticSourceKey, PersistedPointCloudColorSettings>
  >;
  readonly tiles: Readonly<Record<string, PersistedSidebarTilePreferences>>;
}

export const DEFAULT_SIDEBAR_APPEARANCE: SidebarAppearancePreferences =
  Object.freeze({
    pinholeCamera: DEFAULT_PINHOLE_CAMERA,
    pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
    referenceGrid: DEFAULT_REFERENCE_GRID,
    sceneBackground: DEFAULT_SCENE_BACKGROUND,
    showPointCloudColorLegend: false,
  });

export const DEFAULT_PORTABLE_CAMERA_PREFERENCES: PersistedPortableCameraPreferences =
  Object.freeze({
    cameraNavigationMode: "relative",
    navigationCompositions: Object.freeze([]),
    renderableSourceKeys: null,
  });

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = Object.freeze({
  appearance: DEFAULT_SIDEBAR_APPEARANCE,
  camera: DEFAULT_PORTABLE_CAMERA_PREFERENCES,
  imageProjection: Object.freeze({}),
  pointCloudColors: Object.freeze({}),
  tiles: Object.freeze({}),
});

type SidebarPreferencesListener = (preferences: SidebarPreferences) => void;
const listenersByScope = new Map<string, Set<SidebarPreferencesListener>>();

const preferencesStore = createTimestampLruScopedStore<SidebarPreferences>({
  key: SIDEBAR_PREFERENCES_STORAGE_KEY,
  maxScopes: MAX_SIDEBAR_PREFERENCE_SCOPES,
  normalizeScopeKey,
  sanitizeScope: normalizeSidebarPreferences,
  scopeField: "byScope",
  serializeScope: (scope) => ({ ...scope }),
  storage: () => globalThis.localStorage,
  version: STORAGE_VERSION,
});

/** Reads one exact dataset/media-field scope. */
export function readSidebarPreferences(
  scopeKey: string | null | undefined,
): SidebarPreferences {
  const normalized = normalizeScopeKey(scopeKey ?? "");
  return normalized
    ? (preferencesStore.readScope(normalized) ?? DEFAULT_SIDEBAR_PREFERENCES)
    : DEFAULT_SIDEBAR_PREFERENCES;
}

/** Updates one exact scope and refreshes only its LRU timestamp. */
export function updateSidebarPreferences(
  scopeKey: string | null | undefined,
  resolver: (current: SidebarPreferences) => SidebarPreferences,
): SidebarPreferences {
  const normalized = normalizeScopeKey(scopeKey ?? "");
  if (!normalized) return DEFAULT_SIDEBAR_PREFERENCES;
  const next =
    preferencesStore.updateScope(normalized, (current) =>
      resolver(current ?? DEFAULT_SIDEBAR_PREFERENCES),
    ) ?? DEFAULT_SIDEBAR_PREFERENCES;
  for (const listener of listenersByScope.get(normalized) ?? []) listener(next);
  return next;
}

/** Keeps every mounted host for one exact scope reactive to domain writes. */
export function subscribeSidebarPreferences(
  scopeKey: string | null | undefined,
  listener: SidebarPreferencesListener,
): () => void {
  const normalized = normalizeScopeKey(scopeKey ?? "");
  if (!normalized) return () => undefined;
  const listeners = listenersByScope.get(normalized) ?? new Set();
  listeners.add(listener);
  listenersByScope.set(normalized, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) listenersByScope.delete(normalized);
  };
}

/** Exposed for schema/LRU tests. */
export function readSidebarPreferenceScopesForTests() {
  return preferencesStore.readSnapshot().scopes;
}

function normalizeSidebarPreferences(raw: unknown): SidebarPreferences | null {
  if (!isRecord(raw)) return null;
  return {
    appearance: normalizeAppearance(raw.appearance),
    camera: normalizePortableCamera(raw.camera),
    imageProjection: normalizeImageProjectionMap(raw.imageProjection),
    pointCloudColors: normalizePointCloudColorMap(raw.pointCloudColors),
    tiles: normalizeTiles(raw.tiles),
  };
}

function normalizeAppearance(raw: unknown): SidebarAppearancePreferences {
  const candidate = isRecord(raw) ? raw : {};
  return {
    pinholeCamera: normalizePinholeCamera(candidate.pinholeCamera),
    pointCloudPointSize: normalizePointCloudPointSize(
      candidate.pointCloudPointSize,
    ),
    referenceGrid: normalizeReferenceGrid(candidate.referenceGrid),
    sceneBackground: normalizeSceneBackground(candidate.sceneBackground),
    showPointCloudColorLegend: candidate.showPointCloudColorLegend === true,
  };
}

function normalizeImageProjectionMap(
  raw: unknown,
): Record<SemanticSourceKey, PersistedSemanticImageProjection> {
  return normalizeSemanticRecord(raw, (value) => {
    const candidate = isRecord(value) ? value : {};
    const normalized = normalizeImageProjection(value);
    const streams =
      candidate.streams === null
        ? null
        : normalizeSemanticKeyList(candidate.streams);
    return {
      ...normalized,
      calibrationStream: normalizeSemanticSourceKey(
        candidate.calibrationStream,
      ),
      enabled: normalized.enabled && (streams === null || streams.length > 0),
      streams,
    };
  });
}

function normalizePointCloudColorMap(
  raw: unknown,
): Record<SemanticSourceKey, PersistedPointCloudColorSettings> {
  return normalizeSemanticRecord(raw, normalizePointCloudColor);
}

function normalizeTiles(
  raw: unknown,
): Record<string, PersistedSidebarTilePreferences> {
  if (!isRecord(raw)) return {};
  const result: Record<string, PersistedSidebarTilePreferences> = {};
  for (const [tileId, value] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_TILES) break;
    if (!boundedString(tileId, MAX_TILE_ID_LENGTH) || !isRecord(value)) {
      continue;
    }
    const imageSourceKey = normalizeSemanticSourceKey(value.imageSourceKey);
    const threeD = normalizeThreeD(value.threeD);
    const imageLabelSourceKeys = normalizeSemanticListMap(
      value.imageLabelSourceKeys,
    );
    const image3dLabelProjections = normalizeSemanticRecord(
      value.image3dLabelProjections,
      normalizeImage3dLabelProjection,
    );
    const imagePointCloudProjections = normalizeSemanticRecord(
      value.imagePointCloudProjections,
      normalizeImagePointCloudProjection,
    );
    result[tileId] = {
      ...(Object.keys(image3dLabelProjections).length
        ? { image3dLabelProjections }
        : {}),
      ...(Object.keys(imageLabelSourceKeys).length
        ? { imageLabelSourceKeys }
        : {}),
      ...(Object.keys(imagePointCloudProjections).length
        ? { imagePointCloudProjections }
        : {}),
      ...(imageSourceKey ? { imageSourceKey } : {}),
      ...(threeD ? { threeD } : {}),
    };
  }
  return result;
}

function normalizeThreeD(raw: unknown): PersistedScene3dTilePreferences | null {
  if (!isRecord(raw) || !Array.isArray(raw.enabledSourceKeys)) return null;
  const primarySourceKey = normalizeSemanticSourceKey(raw.primarySourceKey);
  return {
    cameraSelectionCustomized: raw.cameraSelectionCustomized === true,
    enabledSourceKeys: normalizeSemanticKeyList(raw.enabledSourceKeys),
    primarySourceKey,
    trajectoryFrameOverrides: normalizeTrajectoryOverrides(
      raw.trajectoryFrameOverrides,
    ),
  };
}

function normalizeImage3dLabelProjection(
  raw: unknown,
): PersistedImage3dLabelProjection {
  const candidate = isRecord(raw) ? raw : {};
  const streams =
    candidate.streams === null
      ? null
      : normalizeSemanticKeyList(candidate.streams);
  const enabled =
    candidate.enabled === true && (streams === null || streams.length > 0);
  return {
    enabled,
    interpolate: candidate.interpolate === true,
    streams,
  };
}

function normalizeImagePointCloudProjection(
  raw: unknown,
): PersistedImagePointCloudProjection {
  const candidate = isRecord(raw) ? raw : {};
  const projection = normalizeImageProjection(raw);
  const streams =
    candidate.streams === null
      ? null
      : normalizeSemanticKeyList(candidate.streams);
  return {
    enabled: projection.enabled && (streams === null || streams.length > 0),
    pointSize: projection.pointSize,
    streams,
  };
}

function normalizePortableCamera(
  raw: unknown,
): PersistedPortableCameraPreferences {
  const candidate = isRecord(raw) ? raw : {};
  return {
    cameraNavigationMode:
      candidate.cameraNavigationMode === "absolute" ? "absolute" : "relative",
    navigationCompositions: normalizeCameraCompositions(
      candidate.navigationCompositions,
    ),
    renderableSourceKeys: Array.isArray(candidate.renderableSourceKeys)
      ? normalizeSemanticKeyList(candidate.renderableSourceKeys)
      : null,
  };
}

function normalizeCameraCompositions(
  raw: unknown,
): readonly PersistedCameraComposition[] {
  if (!Array.isArray(raw)) return [];
  const result: PersistedCameraComposition[] = [];
  for (const candidate of raw.slice(0, MAX_CAMERA_COMPOSITIONS)) {
    if (!isRecord(candidate)) continue;
    const sceneUpAxis = normalizeUpAxis(candidate.sceneUpAxis);
    const trackingMode = normalizeTrackingMode(candidate.trackingMode);
    if (!sceneUpAxis || !trackingMode) continue;
    if (candidate.kind === "bounds-normalized") {
      const viewDirection = normalizeVector3(candidate.viewDirection);
      const targetOffsetInRadii = normalizeVector3(
        candidate.targetOffsetInRadii,
      );
      if (
        !viewDirection ||
        !targetOffsetInRadii ||
        !finitePositive(candidate.distanceInRadii)
      ) {
        continue;
      }
      result.push({
        distanceInRadii: candidate.distanceInRadii,
        kind: "bounds-normalized",
        sceneUpAxis,
        targetOffsetInRadii,
        trackingMode,
        viewDirection,
      });
      continue;
    }
    if (candidate.kind !== "target-relative") continue;
    const relativePosition = normalizeVector3(candidate.relativePosition);
    const relativeTarget = normalizeVector3(candidate.relativeTarget);
    const rotationMode = normalizeFollowTrackingMode(candidate.rotationMode);
    if (
      !relativePosition ||
      !relativeTarget ||
      !rotationMode ||
      !boundedString(candidate.targetFrameId, MAX_FRAME_ID_LENGTH)
    ) {
      continue;
    }
    result.push({
      kind: "target-relative",
      relativePosition,
      relativeTarget,
      rotationMode,
      sceneUpAxis,
      targetFrameId: candidate.targetFrameId,
      trackingMode,
    });
  }
  return result;
}

function normalizeTrajectoryOverrides(
  raw: unknown,
): Record<SemanticSourceKey, string> | undefined {
  if (!isRecord(raw)) return undefined;
  const result: Record<SemanticSourceKey, string> = {};
  for (const [key, frameId] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_SOURCES) break;
    const semanticKey = normalizeSemanticSourceKey(key);
    if (!semanticKey || !boundedString(frameId, MAX_FRAME_ID_LENGTH)) continue;
    result[semanticKey] = frameId;
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizeSemanticListMap(
  raw: unknown,
): Record<SemanticSourceKey, readonly SemanticSourceKey[]> {
  return normalizeSemanticRecord(raw, normalizeSemanticKeyList);
}

function normalizeSemanticRecord<Value>(
  raw: unknown,
  normalizeValue: (raw: unknown) => Value,
): Record<SemanticSourceKey, Value> {
  if (!isRecord(raw)) return {};
  const result: Partial<Record<SemanticSourceKey, Value>> = {};
  for (const [rawKey, value] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_SOURCES) break;
    const key = normalizeSemanticSourceKey(rawKey);
    if (!key) continue;
    result[key] = normalizeValue(value);
  }
  return result as Record<SemanticSourceKey, Value>;
}

function normalizeSemanticKeyList(raw: unknown): readonly SemanticSourceKey[] {
  if (!Array.isArray(raw)) return [];
  return sanitizeBoundedStringList(
    raw,
    MAX_SOURCES,
    MAX_SEMANTIC_SOURCE_KEY_LENGTH,
  )
    .map(normalizeSemanticSourceKey)
    .filter((value): value is SemanticSourceKey => value !== null);
}

function normalizeVector3(
  raw: unknown,
): readonly [number, number, number] | null {
  return Array.isArray(raw) &&
    raw.length === 3 &&
    raw.every((value) => typeof value === "number" && Number.isFinite(value))
    ? (raw as [number, number, number])
    : null;
}

function normalizeTrackingMode(raw: unknown): PersistedTrackingMode | null {
  return raw === "free" ||
    raw === "position" ||
    raw === "heading" ||
    raw === "pose"
    ? raw
    : null;
}

function normalizeFollowTrackingMode(
  raw: unknown,
): "position" | "heading" | "pose" | null {
  return raw === "position" || raw === "heading" || raw === "pose" ? raw : null;
}

function normalizeUpAxis(raw: unknown): "x" | "y" | "z" | null {
  return raw === "x" || raw === "y" || raw === "z" ? raw : null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeScopeKey(value: string): string | null {
  const scope = value.trim();
  return scope && scope.length <= MAX_SCOPE_LENGTH ? scope : null;
}

function boundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
