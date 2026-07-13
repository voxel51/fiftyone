import { useTileId } from "@fiftyone/tiling";
import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Persisted source visibility for one MCAP 3D tile. */
export interface Mcap3dTileVisibility {
  readonly enabledSourceIds: readonly string[];
  /** `null` records that the user deliberately left no primary geometry. */
  readonly primarySourceId: string | null;
}

type ImageLabelTopicsByImage = Readonly<Record<string, readonly string[]>>;

interface McapPersistedTileVisibility {
  readonly imageLabelTopics?: ImageLabelTopicsByImage;
  readonly threeD?: Mcap3dTileVisibility;
}

interface McapPersistedVisibilityScope {
  readonly tiles: Readonly<Record<string, McapPersistedTileVisibility>>;
  readonly updatedAtMs: number;
}

interface McapPersistedVisibilityStore {
  readonly byScope: Readonly<Record<string, McapPersistedVisibilityScope>>;
  readonly version: typeof STORAGE_VERSION;
}

const McapPanelVisibilityScopeContext = createContext<string | null>(null);

const STORAGE_KEY = "fiftyone.mcap.panel-visibility";
const STORAGE_VERSION = 1;
const MAX_SCOPES = 20;
const MAX_TILES_PER_SCOPE = 64;
const MAX_TOPICS_PER_TILE = 128;
const MAX_TOPIC_LENGTH = 512;
const MAX_SCOPE_LENGTH = 1024;
const MAX_TILE_ID_LENGTH = 256;

let cachedStorageValue: string | null | undefined;
let cachedStore: McapPersistedVisibilityStore | null = null;

/**
 * Scopes panel visibility to one dataset/source and media field. The scope is
 * deliberately separate from browser-wide visual styling: topic names and
 * panel intent are meaningful only within the recording family that owns
 * them.
 */
export const McapPanelVisibilityProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
}> = ({ children, scopeKey }) => (
  <McapPanelVisibilityScopeContext.Provider value={scopeKey?.trim() || null}>
    {children}
  </McapPanelVisibilityScopeContext.Provider>
);

/** Returns the recording-specific scope used for panel visibility. */
export function useMcapPanelVisibilityScope(): string | null {
  return useContext(McapPanelVisibilityScopeContext);
}

/** Reads one 3D tile's durable visibility before it creates stream demand. */
export function readMcap3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
): Mcap3dTileVisibility | null {
  return readTileVisibility(scopeKey, tileId)?.threeD ?? null;
}

/** Writes one 3D tile's visibility without disturbing its image settings. */
export function writeMcap3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
  visibility: Mcap3dTileVisibility,
): void {
  writeTileVisibility(scopeKey, tileId, { threeD: visibility });
}

/**
 * Per-image-panel label visibility. A missing entry and an explicit empty
 * entry both render no labels; retaining the empty entry remembers an
 * intentional "all off" choice when label topics later change.
 */
export function useMcapImageTileLabelTopics(imageTopic: string): {
  readonly labelTopics: readonly string[];
  readonly setLabelTopics: (topics: readonly string[]) => void;
} {
  const scopeKey = useMcapPanelVisibilityScope();
  const tileId = useTileId();
  const [topicsByImage, setTopicsByImage] = useState<ImageLabelTopicsByImage>(
    () => readTileVisibility(scopeKey, tileId)?.imageLabelTopics ?? {},
  );
  const topicsByImageRef = useRef(topicsByImage);
  topicsByImageRef.current = topicsByImage;

  // This layout effect handles an in-place scope/tile swap before paint; the
  // playback shell normally remounts at a scope boundary.
  useLayoutEffect(() => {
    const next = readTileVisibility(scopeKey, tileId)?.imageLabelTopics ?? {};
    topicsByImageRef.current = next;
    setTopicsByImage(next);
  }, [scopeKey, tileId]);

  const setLabelTopics = useCallback(
    (topics: readonly string[]) => {
      if (!imageTopic) return;
      const next = {
        ...topicsByImageRef.current,
        [imageTopic]: sanitizeTopicList(topics),
      };
      topicsByImageRef.current = next;
      setTopicsByImage(next);
      writeTileVisibility(scopeKey, tileId, { imageLabelTopics: next });
    },
    [imageTopic, scopeKey, tileId],
  );

  return {
    labelTopics: imageTopic ? (topicsByImage[imageTopic] ?? []) : [],
    setLabelTopics,
  };
}

function readTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
): McapPersistedTileVisibility | null {
  if (!scopeKey || !tileId) return null;
  return readStore()?.byScope[scopeKey]?.tiles[tileId] ?? null;
}

function writeTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
  patch: Partial<McapPersistedTileVisibility>,
): void {
  if (!isBoundedString(scopeKey, MAX_SCOPE_LENGTH)) return;
  if (!isBoundedString(tileId, MAX_TILE_ID_LENGTH)) return;

  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const current = readStore();
    const byScope = { ...current?.byScope };
    const currentScope = byScope[scopeKey];
    const tiles = { ...currentScope?.tiles };
    tiles[tileId] = { ...tiles[tileId], ...patch };
    byScope[scopeKey] = { tiles, updatedAtMs: Date.now() };
    evictOldestScopes(byScope);
    const next: McapPersistedVisibilityStore = {
      byScope,
      version: STORAGE_VERSION,
    };
    const serialized = JSON.stringify(next);
    storage.setItem(STORAGE_KEY, serialized);
    cachedStorageValue = serialized;
    cachedStore = next;
  } catch {
    // Visibility persistence is best-effort and must never block playback.
  }
}

function readStore(): McapPersistedVisibilityStore | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === cachedStorageValue) return cachedStore;
    cachedStorageValue = raw ?? null;
    cachedStore = null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== STORAGE_VERSION) return null;
    const byScope = sanitizeScopes(candidate.byScope);
    cachedStore = { byScope, version: STORAGE_VERSION };
    return cachedStore;
  } catch {
    cachedStore = null;
    return null;
  }
}

function sanitizeScopes(
  raw: unknown,
): Record<string, McapPersistedVisibilityScope> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, McapPersistedVisibilityScope> = {};
  for (const [scopeKey, rawScope] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_SCOPES) break;
    if (!isBoundedString(scopeKey, MAX_SCOPE_LENGTH)) continue;
    if (typeof rawScope !== "object" || rawScope === null) continue;
    const scope = rawScope as Record<string, unknown>;
    const tiles = sanitizeTiles(scope.tiles);
    const updatedAtMs =
      typeof scope.updatedAtMs === "number" &&
      Number.isFinite(scope.updatedAtMs)
        ? scope.updatedAtMs
        : 0;
    result[scopeKey] = { tiles, updatedAtMs };
  }
  return result;
}

function sanitizeTiles(
  raw: unknown,
): Record<string, McapPersistedTileVisibility> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, McapPersistedTileVisibility> = {};
  for (const [tileId, rawTile] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_TILES_PER_SCOPE) break;
    if (!isBoundedString(tileId, MAX_TILE_ID_LENGTH)) continue;
    if (typeof rawTile !== "object" || rawTile === null) continue;
    const tile = rawTile as Record<string, unknown>;
    const threeD = sanitize3dVisibility(tile.threeD);
    const imageLabelTopics = sanitizeImageLabelTopics(tile.imageLabelTopics);
    if (threeD || imageLabelTopics) {
      result[tileId] = {
        ...(imageLabelTopics ? { imageLabelTopics } : {}),
        ...(threeD ? { threeD } : {}),
      };
    }
  }
  return result;
}

function sanitize3dVisibility(raw: unknown): Mcap3dTileVisibility | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.enabledSourceIds)) return null;
  const primarySourceId = candidate.primarySourceId;
  if (
    primarySourceId !== null &&
    !isBoundedString(primarySourceId, MAX_TOPIC_LENGTH)
  ) {
    return null;
  }
  return {
    enabledSourceIds: sanitizeTopicList(candidate.enabledSourceIds),
    primarySourceId,
  };
}

function sanitizeImageLabelTopics(
  raw: unknown,
): Record<string, readonly string[]> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const result: Record<string, readonly string[]> = {};
  for (const [imageTopic, labelTopics] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_TOPICS_PER_TILE) break;
    if (!isBoundedString(imageTopic, MAX_TOPIC_LENGTH)) continue;
    if (!Array.isArray(labelTopics)) continue;
    result[imageTopic] = sanitizeTopicList(labelTopics);
  }
  return result;
}

function sanitizeTopicList(raw: readonly unknown[]): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const topic of raw) {
    if (result.length >= MAX_TOPICS_PER_TILE) break;
    if (!isBoundedString(topic, MAX_TOPIC_LENGTH) || seen.has(topic)) continue;
    seen.add(topic);
    result.push(topic);
  }
  return result;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  );
}

function evictOldestScopes(
  byScope: Record<string, McapPersistedVisibilityScope>,
): void {
  while (Object.keys(byScope).length > MAX_SCOPES) {
    let oldestKey: string | null = null;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [scopeKey, scope] of Object.entries(byScope)) {
      if (scope.updatedAtMs < oldestTimestamp) {
        oldestKey = scopeKey;
        oldestTimestamp = scope.updatedAtMs;
      }
    }
    if (!oldestKey) return;
    delete byScope[oldestKey];
  }
}
