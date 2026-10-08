/**
 * Tile kinds the group sample view can host. Built-in content only for now;
 * plugin panels arrive as `panel:<name>` kinds in a later phase.
 */
export const GROUP_TILE_TYPE = {
  CAROUSEL: "carousel",
  MEDIA: "media",
  THREE_D: "3d",
  SAMPLE: "sample",
} as const;

export type GroupTileType =
  (typeof GROUP_TILE_TYPE)[keyof typeof GROUP_TILE_TYPE];

export const GROUP_TILE_TYPES: readonly GroupTileType[] =
  Object.values(GROUP_TILE_TYPE);

export function isGroupTileType(value: string): value is GroupTileType {
  return (GROUP_TILE_TYPES as readonly string[]).includes(value);
}

/** Id of the single default instance of each kind (`<type>-default`). */
export function defaultGroupTileId(type: GroupTileType): string {
  return `${type}-default`;
}

/**
 * Tile type encoded in a tile id. Ids are `${type}-${suffix}` (e.g.
 * `media-default`, `3d-2`), so the type is everything before the final
 * dash. Returns `null` for ids without a suffix.
 */
export function tileTypeFromId(tileId: string): string | null {
  const finalDashIndex = tileId.lastIndexOf("-");
  const hasTypeBeforeDash = finalDashIndex > 0;
  const hasSuffixAfterDash = finalDashIndex < tileId.length - 1;
  if (!hasTypeBeforeDash || !hasSuffixAfterDash) {
    return null;
  }
  return tileId.slice(0, finalDashIndex);
}
