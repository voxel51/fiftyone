import Spotlight from "../src/index";
import type { ID, ItemData, Response } from "../src/types";

const PAGE_SIZE = 51;
const TOTAL = 510;

type Cursor = number;
type Data = { color: string; index: number; row?: number };

const ITEMS: ItemData<Cursor, Data>[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: { description: `item-${i}` },
  aspectRatio: 0.5 + Math.random() * 4.5,
  key: Math.floor(i / PAGE_SIZE) * PAGE_SIZE,
  data: { color: `hsl(${Math.floor(Math.random() * 360)}, 80%, 40%)`, index: i + 1 },
}));

const ITEM_INDEX = new Map(ITEMS.map((item) => [item.id.description, item]));

async function get(cursor: Cursor): Promise<Response<Cursor, Data>> {
  await new Promise<void>((r) => setTimeout(r, 20));
  const items = ITEMS.slice(cursor, cursor + PAGE_SIZE);
  return {
    items,
    next: cursor + PAGE_SIZE < TOTAL ? cursor + PAGE_SIZE : null,
    previous: cursor > 0 ? cursor - PAGE_SIZE : null,
  };
}

// Swimlanes
const LANE_COUNT = 51;
const LANE_PAGE_SIZE = 20;
const LANE_TOTAL = 51;

const laneData = Array.from({ length: LANE_COUNT }, (_, li) => {
  const hue = Math.floor(Math.random() * 360);
  const color = `hsl(${hue}, 75%, 40%)`;
  const items: ItemData<Cursor, Data>[] = Array.from({ length: LANE_TOTAL }, (_, i) => ({
    id: { description: `lane-${li}-item-${i}` },
    aspectRatio: i + 1,
    key: Math.floor(i / LANE_PAGE_SIZE) * LANE_PAGE_SIZE,
    data: { color, index: i + 1, row: (li + 1) * 10 },
  }));
  return { items, index: new Map(items.map((it) => [it.id.description, it])) };
});

let spotlight: Spotlight<Cursor, Data> | null = null;

function destroyAll() {
  spotlight?.destroy();
  spotlight = null;
}

function renderItem(index: Map<string, ItemData<Cursor, Data>>, id: ID, element: HTMLDivElement) {
  const item = index.get(id.description)!;
  element.style.background = item.data.color;
  element.style.display = "flex";
  element.style.alignItems = "center";
  element.style.justifyContent = "center";
  element.style.color = "rgba(255,255,255,0.6)";
  element.style.fontSize = "11px";
  element.style.fontFamily = "system-ui, sans-serif";
  element.textContent = String(item.data.index + (item.data.row ?? 0));
}

type Mode = "vertical" | "horizontal" | "swimlanes";

function mount(mode: Mode) {
  destroyAll();
  const container = document.getElementById("container")!;
  container.innerHTML = "";

  if (mode === "swimlanes") {
    const rect = container.getBoundingClientRect();
    // Lane height = 1/5 of container; expressed as an aspect ratio
    const laneAR = (rect.width / rect.height) * 5;

    const outerItems: ItemData<Cursor, Data>[] = laneData.map((_, li) => ({
      id: { description: `lane-${li}` },
      aspectRatio: laneAR,
      key: li,
      data: { color: "", index: li },
    }));

    // Inner spotlights are created once per lane item and reused across show/hide cycles
    // because the outer Spotlight reuses the same element div each time.
    const innerSpotlights = new Map<string, Spotlight<Cursor, Data>>();
    // Track the wheel handler attached to each lane element so we can remove
    // it on detach. Without this, lane elements that get reused stack
    // duplicate handlers and multiply scroll deltas over time.
    const laneWheelBindings = new Map<
      string,
      { element: HTMLElement; handler: (e: WheelEvent) => void }
    >();

    spotlight = new Spotlight<Cursor, Data>({
      key: 0,
      offset: 0,
      scrollbar: true,
      spacing: 4,
      rowAspectRatioThreshold: () => 0,
      async get(cursor) {
        return {
          items: [outerItems[cursor]],
          next: cursor + 1 < LANE_COUNT ? cursor + 1 : null,
          previous: cursor > 0 ? cursor - 1 : null,
        };
      },
      showItem({ id, element }) {
        if (!innerSpotlights.has(id.description)) {
          const wheelHandler = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
              (element.firstElementChild as HTMLElement)?.scrollBy(e.deltaX, 0);
            } else {
              (container.firstElementChild as HTMLElement)?.scrollBy(0, e.deltaY);
            }
          };
          element.addEventListener("wheel", wheelHandler, { passive: false });
          laneWheelBindings.set(id.description, { element, handler: wheelHandler });

          const li = parseInt(id.description.split("-")[1]);
          const { items, index } = laneData[li];

          const s = new Spotlight<Cursor, Data>({
            key: 0,
            offset: 0,
            horizontal: true,
            scrollbar: true,
            spacing: 4,
            rowAspectRatioThreshold: () => 0,
            async get(cursor) {
              await new Promise<void>((r) => setTimeout(r, 20));
              const page = items.slice(cursor, cursor + LANE_PAGE_SIZE);
              return {
                items: page,
                next: cursor + LANE_PAGE_SIZE < LANE_TOTAL ? cursor + LANE_PAGE_SIZE : null,
                previous: cursor > 0 ? cursor - LANE_PAGE_SIZE : null,
              };
            },
            showItem({ id, element }) {
              renderItem(index, id, element);
              return Promise.resolve(0);
            },
            hideItem() {},
            detachItem() {},
          });

          innerSpotlights.set(id.description, s);
          s.attach(element);
        }
        return Promise.resolve(0);
      },
      hideItem() {},
      detachItem(id) {
        const binding = laneWheelBindings.get(id.description);
        if (binding) {
          binding.element.removeEventListener("wheel", binding.handler);
          laneWheelBindings.delete(id.description);
        }
        innerSpotlights.get(id.description)?.destroy();
        innerSpotlights.delete(id.description);
      },
    });

    spotlight.attach(container);
    return;
  }

  spotlight = new Spotlight<Cursor, Data>({
    key: 0,
    offset: 0,
    horizontal: mode === "horizontal",
    scrollbar: true,
    spacing: 4,
    rowAspectRatioThreshold: () => (mode === "horizontal" ? 3 : 4),
    get,
    showItem({ id, element }) {
      renderItem(ITEM_INDEX, id, element);
      return Promise.resolve(0);
    },
    hideItem() {},
    detachItem() {},
  });

  spotlight.attach(container);
}

const DESCRIPTIONS: Record<string, string> = {
  "btn-vertical": "510 items with randomized aspect ratios tiled into rows, with bidirectional infinite scrolling and a virtualized render buffer that loads pages on demand in both directions.",
  "btn-horizontal": "510 items with randomized aspect ratios in a horizontally-scrolling strip, with bidirectional infinite scrolling and on-demand page loading.",
  "btn-swimlanes": "51 horizontal lanes managed by a single outer vertical spotlight; each lane independently infinite-scrolls through 51 items of increasing aspect ratio, with both axes virtualized and scroll-isolated.",
};

function setActive(id: string) {
  ["btn-vertical", "btn-horizontal", "btn-swimlanes"].forEach((bid) => {
    document.getElementById(bid)!.classList.toggle("active", bid === id);
  });
  document.getElementById("description")!.textContent = DESCRIPTIONS[id];
}

document.getElementById("btn-vertical")!.addEventListener("click", () => {
  setActive("btn-vertical");
  mount("vertical");
});

document.getElementById("btn-horizontal")!.addEventListener("click", () => {
  setActive("btn-horizontal");
  mount("horizontal");
});

document.getElementById("btn-swimlanes")!.addEventListener("click", () => {
  setActive("btn-swimlanes");
  mount("swimlanes");
});

mount("vertical");
