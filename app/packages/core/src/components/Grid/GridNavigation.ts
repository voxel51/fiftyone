import type { PaginateSamplesNode } from "@fiftyone/relay";
import type {
  GridCursor,
  GridLocation,
  SelectionRequest,
} from "@fiftyone/state/src/selection";
import BoundedMap from "./BoundedMap";

type SeekPage = Extract<GridLocation, { kind: "seek" }>;

/** Relative page coordinates for one identity-anchored grid window. */
export class GridNavigation {
  private readonly cursors = new BoundedMap<number, GridCursor>(512);
  private readonly seeds = new Map<
    number,
    {
      nodes: readonly PaginateSamplesNode[];
      next: number | null;
      previous: number | null;
    }
  >();
  private seek = false;
  revision = 0;
  request?: SelectionRequest;

  reset() {
    this.revision++;
    this.cursors.clear();
    this.seeds.clear();
    this.seek = false;
    this.request = undefined;
  }

  start(
    page: number,
    nodes: readonly PaginateSamplesNode[],
    location?: SeekPage,
    more = false,
  ) {
    this.reset();
    this.seek = Boolean(location);
    const neighbors = location
      ? this.remember(page, location)
      : { previous: page > 0 ? page - 1 : null, next: more ? page + 1 : null };
    this.seeds.set(page, { nodes, ...neighbors });
  }

  takeSeed(page: number) {
    const nodes = this.seeds.get(page);
    this.seeds.delete(page);
    return nodes;
  }

  get active() {
    return this.seek;
  }

  cursor(page: number) {
    const cursor = this.cursors.get(page);
    // Refresh active bookmarks so a long browse cannot evict the page that
    // the grid will need after a layout refresh.
    if (cursor) this.cursors.set(page, cursor);
    return cursor;
  }

  remember(page: number, result: SeekPage) {
    // Keep an identity for reloading this page after a layout refresh.
    const first = result.nodes[0];
    if (first)
      this.cursors.set(
        page,
        this.cursors.get(page) ?? { sampleId: first.id, direction: "at" },
      );
    if (result.previous && !this.cursors.has(page - 1))
      this.cursors.set(page - 1, result.previous);
    if (result.next && !this.cursors.has(page + 1))
      this.cursors.set(page + 1, result.next);
    return {
      previous: result.previous ? page - 1 : null,
      next: result.next ? page + 1 : null,
    };
  }
}
