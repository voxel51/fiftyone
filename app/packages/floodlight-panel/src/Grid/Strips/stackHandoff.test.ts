import type { ID, Show } from "@fiftyone/floodlight";
import { describe, expect, test, vi } from "vitest";
import {
  createOwnership,
  type Renderer,
  scopeRenderer,
} from "../../host/ownership";
import {
  createLayerSlot,
  sizedRenderer,
  takeoverRenderer,
} from "./stackHandoff";

// Mirrors useRenderer over the looker cache: a shown key returns early, a
// cached one is reattached, and only an unknown key creates a looker.
const cacheRenderer = () => {
  const lookers = new Map<string, { host: HTMLElement }>();
  const shown = new Set<string>();
  const createItem = vi.fn((key: string) => {
    const looker = { host: document.createElement("span") };
    looker.host.dataset.key = key;
    lookers.set(key, looker);
    return looker;
  });

  const showItem: Show<number, unknown> = async ({ element, id }) => {
    const key = id.description;
    if (shown.has(key)) return 0;
    const looker = lookers.get(key) ?? createItem(key);
    element.appendChild(looker.host);
    shown.add(key);
    return 0;
  };

  return {
    createItem,
    lookers,
    renderer: {
      showItem,
      hideItem: ({ id }: { id: ID }) => shown.delete(id.description),
      detachItem: vi.fn((id: ID) => {
        lookers.get(id.description)?.host.remove();
        shown.delete(id.description);
      }),
    },
    shown,
  };
};

const tile = () => document.createElement("div");
const show = (
  renderer: Renderer<number, unknown>,
  id: ID,
  element: HTMLDivElement,
) =>
  renderer.showItem({
    dimensions: [10, 10],
    element,
    id,
    spotlight: undefined as never,
    zooming: false,
  });

describe("stack ↔ grid handoff", () => {
  test("the grid reuses the stack's looker and hands it back", async () => {
    const fake = cacheRenderer();
    const group = createOwnership();
    const id = { description: "a" };
    const layer = createLayerSlot(fake.renderer, group);
    const layerElement = tile();

    await layer.show(id, layerElement, [10, 10]);
    expect(fake.createItem).toHaveBeenCalledTimes(1);
    const looker = fake.lookers.get("a")!;

    // expand: the layer lets go, the grid shows the same item
    layer.suspend();
    const grid = takeoverRenderer(fake.renderer, group);
    const gridTile = tile();
    await show(grid, id, gridTile);
    expect(gridTile.firstChild).toBe(looker.host);

    // disposing the stack's layer leaves the grid's tile alone
    layer.release(id);
    expect(fake.renderer.detachItem).not.toHaveBeenCalled();
    expect(gridTile.firstChild).toBe(looker.host);

    // collapse: the grid is torn down, a new layer takes the looker back
    grid.detachItem(id);
    const back = createLayerSlot(fake.renderer, group);
    const backElement = tile();
    await back.show(id, backElement, [10, 10]);
    expect(backElement.firstChild).toBe(looker.host);
    expect(fake.createItem).toHaveBeenCalledTimes(1);
  });

  test("a plain scoped grid cannot take a looker a layer still shows", async () => {
    const fake = cacheRenderer();
    const group = createOwnership();
    const id = { description: "a" };
    const layer = createLayerSlot(fake.renderer, group);
    const layerElement = tile();
    await layer.show(id, layerElement, [10, 10]);

    const grid = scopeRenderer(fake.renderer, group);
    const gridTile = tile();
    await show(grid, id, gridTile);
    expect(gridTile.firstChild).toBeNull();
  });

  test("a takeover grid reattaches a looker a live instance still shows", async () => {
    const fake = cacheRenderer();
    const group = createOwnership();
    const id = { description: "a" };
    const old = takeoverRenderer(fake.renderer, group);
    await show(old, id, tile());

    // a rebuild: the next instance shows the item while the old one is up
    const next = takeoverRenderer(fake.renderer, group);
    const nextTile = tile();
    await show(next, id, nextTile);
    expect(nextTile.firstChild).toBe(fake.lookers.get("a")!.host);

    old.hideItem({ id });
    old.detachItem(id);
    expect(fake.renderer.detachItem).not.toHaveBeenCalled();
    expect(nextTile.firstChild).toBe(fake.lookers.get("a")!.host);

    // later shows by the owner keep the shown fast path
    await show(next, id, nextTile);
    expect(fake.createItem).toHaveBeenCalledTimes(1);
  });

  test("a released layer detaches the looker it still owns", async () => {
    const fake = cacheRenderer();
    const id = { description: "a" };
    const layer = createLayerSlot(fake.renderer, createOwnership());
    const element = tile();
    await layer.show(id, element, [10, 10]);

    layer.release(id);
    expect(fake.renderer.detachItem).toHaveBeenCalledTimes(1);
    expect(element.firstChild).toBeNull();
  });
});

// Like cacheRenderer, but lookers keep the size they were drawn at, and a
// reattach at a different size counts as a resize.
const sizedCache = () => {
  const lookers = new Map<
    string,
    { host: HTMLElement; size: [number, number] }
  >();
  const shown = new Set<string>();
  const counts = { creates: 0, resizes: 0 };
  const showItem: Show<number, unknown> = async ({
    dimensions,
    element,
    id,
  }) => {
    const key = id.description;
    if (shown.has(key)) return 0;
    let looker = lookers.get(key);
    if (!looker) {
      counts.creates++;
      looker = { host: document.createElement("canvas"), size: dimensions };
      lookers.set(key, looker);
    } else if (
      looker.size[0] !== dimensions[0] ||
      looker.size[1] !== dimensions[1]
    ) {
      counts.resizes++;
      looker.size = dimensions;
    }
    element.appendChild(looker.host);
    shown.add(key);
    return 0;
  };
  const renderer = {
    showItem,
    hideItem: ({ id }: { id: ID }) => {
      shown.delete(id.description);
    },
    detachItem: (id: ID) => {
      lookers.get(id.description)?.host.remove();
      shown.delete(id.description);
    },
  };
  const sizes = new Map<string, [number, number]>();
  const shimmered: HTMLElement[] = [];
  const sizing = {
    has: (key: string) => lookers.has(key),
    shimmer: (element: HTMLDivElement) => shimmered.push(element),
    sizes,
  };
  return { counts, lookers, renderer, shimmered, sizing };
};

const LAYER: [number, number] = [100, 100];
const TILE: [number, number] = [150, 120];
const ids = ["a", "b", "c"].map((description) => ({ description }));

const showAt = (
  renderer: Renderer<number, unknown>,
  id: ID,
  dimensions: [number, number],
) =>
  renderer.showItem({
    dimensions,
    element: tile(),
    id,
    spotlight: undefined as never,
    zooming: false,
  });

/** Three stack layers holding a, b and c at their real size. */
const stacked = async () => {
  const fake = sizedCache();
  const ownership = createOwnership();
  const layers = ids.map(() =>
    createLayerSlot(fake.renderer, ownership, fake.sizing),
  );
  await Promise.all(
    layers.map((layer, i) => layer.show(ids[i], tile(), LAYER)),
  );
  return { fake, layers, ownership };
};

describe("flights keep lookers at their size", () => {
  test("expand: no resize or create in flight, one resize per stacked tile after", async () => {
    const { fake, layers, ownership } = await stacked();
    expect(fake.counts).toEqual({ creates: 3, resizes: 0 });
    const d = { description: "d" };

    // the flight: layers let go, the moving grid reattaches at last size
    layers.forEach((layer) => layer.suspend());
    const moving = takeoverRenderer(
      sizedRenderer(fake.renderer, fake.sizing, true),
      ownership,
    );
    await Promise.all([...ids, d].map((id) => showAt(moving, id, TILE)));
    expect(fake.counts).toEqual({ creates: 3, resizes: 0 });
    expect(fake.shimmered).toHaveLength(1);

    // the flight ends: a content build, swapped in at its load
    const content = takeoverRenderer(
      sizedRenderer(fake.renderer, fake.sizing, false),
      ownership,
    );
    content.defer();
    await Promise.all([...ids, d].map((id) => showAt(content, id, TILE)));
    expect(fake.counts).toEqual({ creates: 3, resizes: 0 });
    moving.retire();
    content.flush();
    expect(fake.counts).toEqual({ creates: 4, resizes: 3 });

    layers.forEach((layer, i) => layer.release(ids[i]));
    expect(fake.counts).toEqual({ creates: 4, resizes: 3 });
    expect(fake.sizing.sizes.get("a")).toEqual(TILE);
  });

  test("collapse: layers fly at the tiles' size, then resize once each", async () => {
    const { fake, layers, ownership } = await stacked();
    layers.forEach((layer) => layer.suspend());
    const grid = takeoverRenderer(
      sizedRenderer(fake.renderer, fake.sizing, false),
      ownership,
    );
    await Promise.all(ids.map((id) => showAt(grid, id, TILE)));
    const before = { ...fake.counts };
    expect(before).toEqual({ creates: 3, resizes: 3 });

    // the grid is torn down; the layers come back mid-flight
    ids.forEach((id) => grid.detachItem(id));
    const back = ids.map(() =>
      createLayerSlot(fake.renderer, ownership, fake.sizing),
    );
    const elements = ids.map(() => tile());
    const shown = await Promise.all(
      back.map((layer, i) => layer.show(ids[i], elements[i], LAYER, true)),
    );
    expect(shown).toEqual([true, true, true]);
    expect(fake.counts).toEqual(before);
    elements.forEach((element, i) =>
      expect(element.firstChild).toBe(
        fake.lookers.get(ids[i].description)!.host,
      ),
    );

    // the flight ends: each layer re-shows at its real size
    back.forEach((layer) => layer.suspend());
    await Promise.all(
      back.map((layer, i) => layer.show(ids[i], elements[i], LAYER)),
    );
    expect(fake.counts).toEqual({ creates: 3, resizes: 6 });
  });

  test("a flying layer with no cached looker shimmers instead of creating one", async () => {
    const fake = sizedCache();
    const layer = createLayerSlot(
      fake.renderer,
      createOwnership(),
      fake.sizing,
    );
    const element = tile();

    expect(await layer.show({ description: "x" }, element, LAYER, true)).toBe(
      false,
    );
    expect(fake.counts.creates).toBe(0);
    expect(fake.shimmered).toEqual([element]);

    layer.suspend();
    expect(await layer.show({ description: "x" }, element, LAYER)).toBe(true);
    expect(fake.counts.creates).toBe(1);
  });
});
