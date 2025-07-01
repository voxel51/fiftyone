import * as fos from "@fiftyone/state";
import type { InteractiveItems } from "./types";

export const MARGIN = 3;

export enum Direction {
  UP = "UP",
  DOWN = "DOWN",
}

export const fn = (
  items: InteractiveItems,
  currentOrder: string[],
  newOrder: string[],
  activeKey: string | null = null,
  delta = 0,
  lastTouched: string | null = null
) => {
  let groupActive = false;
  const currentY = {};
  let y = 0;
  for (const key of currentOrder) {
    const {
      entry,
      el,
      controller: { springs },
    } = items[key];
    if (entry.kind === fos.EntryKind.GROUP) {
      groupActive = key === activeKey;
    }
    let shown = true;

    if (entry.kind === fos.EntryKind.PATH) {
      shown = entry.shown;
    } else if (entry.kind === fos.EntryKind.EMPTY) {
      shown = entry.shown;
    }

    const height = el.getBoundingClientRect().height;
    const scale = springs.scale.get();
    if (scale > 1) {
      y += (height - height / scale) / 2;
    }

    currentY[key] = y;

    if (shown) {
      y += height + MARGIN;
    }
  }

  let scale = 1;
  if (activeKey) {
    const w = items[activeKey].el.parentElement?.getBoundingClientRect()
      .width as number;
    scale = (w - 12) / (w - 16);
  }

  const results = {};
  y = 0;
  let paths = 0;

  groupActive = false;
  let groupRaised = false;
  for (const key of newOrder) {
    const {
      entry,
      active,
      el,
      controller: { springs },
    } = items[key];
    if (entry.kind === fos.EntryKind.GROUP) {
      groupActive = key === activeKey;
      groupRaised = lastTouched === key;
      paths = 0;
    }

    const dragging =
      (activeKey === key || groupActive) && entry.kind !== fos.EntryKind.INPUT;
    const raise = dragging || groupRaised || key === lastTouched;
    let shown = true;

    if (entry.kind === fos.EntryKind.PATH) {
      shown = entry.shown;
      paths++;
    } else if (entry.kind === fos.EntryKind.EMPTY) {
      shown = paths === 0 && entry.shown;
    }

    results[key] = {
      cursor: dragging ? "grabbing" : "pointer",
      top: dragging ? currentY[key] + delta : y,
      zIndex: dragging || raise ? 1 : 0,
      scale: dragging ? scale : 1,
      shadow: dragging ? 8 : 0,
      left: shown ? 0 : -3000,
      height: shown
        ? Array.from(el.children).reduce((height, child) => {
            return height + child.getBoundingClientRect().height;
          }, 0)
        : 0,
    };

    if (active) {
      results[key].immediate = (k) => ["left", "zIndex", "cursor"].includes(k);
    }

    if (shown) {
      y += el.getBoundingClientRect().height / springs.scale.get() + MARGIN;
    }

    if (activeKey) {
      results[key].immediate = (k) =>
        (dragging && k !== "scale") || ["left", "zIndex", "cursor"].includes(k);
    }
  }

  return { results, minHeight: y };
};

export const getAfterKey = (
  activeKey: string | null,
  items: InteractiveItems,
  order: string[],
  direction: Direction,
  disabled: i
): string | null => {
  if (activeKey === null || !items[activeKey]) {
    return null;
  }

  const up = direction === Direction.UP;
  const baseTop =
    items[order[0]].el.parentElement?.getBoundingClientRect().y || 0;
  const isGroup = items[activeKey].entry.kind === fos.EntryKind.GROUP;
  const measurement = isGroup
    ? measureGroups(activeKey, items, order)
    : measureEntries(activeKey, items, order);

  const data = measurement.data.filter(
    ({ key }) => !isDisabledEntry(items[key].entry, disabled, !isGroup)
  );

  const { top } = items[activeKey].el.getBoundingClientRect();
  let y = top - baseTop;

  if (!up) {
    y += measurement.activeHeight;
  }

  let filtered = data
    .map(({ key, top, height }) => {
      const midpoint = up ? top + height / 2 : top + height - height / 2;
      return {
        delta: up ? midpoint - y : y - midpoint,
        key,
      };
    })
    .sort((a, b) => a.delta - b.delta)
    .filter(({ delta, key }) => delta >= 0 || key === activeKey);

  if (!filtered.length) {
    return up ? data.slice(-1)[0].key : data[0].key;
  }

  if (up && !isGroup) {
    filtered = filtered.filter(({ key }) => {
      const prev = order[order.indexOf(key) - 1];
      return !prev || !isDisabledEntry(items[prev].entry, disabled);
    });
  }

  const result = filtered[0].key;
  if (isGroup) {
    if (result === null) return order[0];

    let index = order.indexOf(result) + (up ? -1 : 1);
    if (result === activeKey) up ? index++ : index--;
    if (index <= 0) order[0];

    if (order[index] === activeKey) return activeKey;

    index++;
    try {
      while (
        [fos.EntryKind.PATH, fos.EntryKind.EMPTY].includes(
          items[order[index]].entry.kind
        )
      )
        index++;

      index--;
    } catch {}

    return order[index];
  }

  const first = order.filter(
    (key) => !isDisabledEntry(items[key].entry, disabled, true)
  )[0];
  if (order.indexOf(result) <= order.indexOf(first)) {
    if (up) return order[order.indexOf(first) + 1];
    return first;
  }

  return result;
};

export const getEntryKey = (entry: fos.SidebarEntry) => {
  if (entry.kind === fos.EntryKind.GROUP) {
    return JSON.stringify([entry.name]);
  }

  if (entry.kind === fos.EntryKind.PATH) {
    return JSON.stringify(["", entry.path]);
  }

  if (entry.kind === fos.EntryKind.EMPTY) {
    return JSON.stringify([entry.group, ""]);
  }
  if (entry.kind === fos.EntryKind.INPUT) {
    return `input-${entry.type}`;
  }

  throw new Error("invalid entry");
};

const isDisabledEntry = (
  entry: fos.SidebarEntry,
  isDisabled: (entry: fos.SidebarEntry) => boolean,
  excludeGroups = false
) => {
  if (entry.kind === fos.EntryKind.PATH) {
    return isDisabled(entry);
  }

  if (entry.kind === fos.EntryKind.EMPTY) {
    return entry.group === "tags";
  }

  if (excludeGroups && entry.kind === fos.EntryKind.GROUP) {
    return entry.name === "tags" || entry.name === "other";
  }

  if (entry.kind === fos.EntryKind.INPUT) {
    return true;
  }

  return false;
};

const isShown = (entry: fos.SidebarEntry) => {
  if (entry.kind === fos.EntryKind.PATH && !entry.shown) {
    return false;
  }

  if (entry.kind === fos.EntryKind.EMPTY && !entry.shown) {
    return false;
  }

  if (entry.kind === fos.EntryKind.INPUT) {
    return true;
  }

  return true;
};

const measureEntries = (
  activeKey: string,
  items: InteractiveItems,
  order: string[]
): {
  data: { top: number; height: number; key: string }[];
  activeHeight: number;
} => {
  const data: { key: string; height: number; top: number }[] = [];
  let previous = { top: -MARGIN, height: 0 };
  let activeHeight = 0;

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const entry = items[key].entry;

    if (!isShown(entry)) continue;

    let height = items[key].el.getBoundingClientRect().height;

    if (key === activeKey) activeHeight = height;

    height /= items[key].controller.springs.scale.get();

    const top = previous.top + previous.height + MARGIN;
    data.push({ key, height, top });
    previous = { top, height };
  }

  return { data, activeHeight };
};

const measureGroups = (
  activeKey: string,
  items: InteractiveItems,
  order: string[]
): {
  data: { top: number; height: number; key: string }[];
  activeHeight: number;
} => {
  let current = {
    top: -MARGIN,
    height: 0,
    key: getEntryKey(items[order[0]].entry),
  };
  const data: typeof current[] = [];
  let activeHeight = -MARGIN;

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const entry = items[key].entry;

    if (entry.kind === fos.EntryKind.INPUT && entry.type === "add") break;

    if (entry.kind === fos.EntryKind.GROUP) {
      data.push(current);
      current = { top: current.top + current.height, height: 0, key };
      data[data.length - 1].height -= MARGIN;
    }

    if (!isShown(entry)) continue;

    const height = items[key].el.getBoundingClientRect().height;
    if (current.key === activeKey) {
      activeHeight += MARGIN + height;
    }

    current.height +=
      height / items[key].controller.springs.scale.get() + MARGIN;
  }

  data.push(current);

  return { data, activeHeight };
};
