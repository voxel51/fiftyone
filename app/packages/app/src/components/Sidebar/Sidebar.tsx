import React, { useCallback, useRef, useState } from "react";
import { RecoilState, useRecoilState } from "recoil";
import { animated, Controller } from "@react-spring/web";
import styled from "styled-components";

import { move } from "@fiftyone/utilities";

import { useEventHandler } from "../../utils/hooks";
import { scrollbarStyles } from "../utils";
import { EntryKind, SidebarEntry } from "./utils";

const MARGIN = 4;

const fn = (
  items: InteractiveItems,
  currentOrder: string[],
  newOrder: string[],
  activeKey: string = null,
  delta = 0
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
    if (entry.kind === EntryKind.GROUP) {
      groupActive = key === activeKey;
    }
    let shown = true;

    if (entry.kind === EntryKind.PATH) {
      shown = entry.shown;
    } else if (entry.kind === EntryKind.EMPTY) {
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

  const results = {};
  y = 0;
  let paths = 0;

  groupActive = false;
  for (const key of newOrder) {
    const {
      entry,
      el,
      controller: { springs },
    } = items[key];
    if (entry.kind === EntryKind.GROUP) {
      groupActive = key === activeKey;
      paths = 0;
    }

    const dragging =
      (activeKey === key || groupActive) && entry.kind !== EntryKind.TAIL;
    let shown = true;

    if (entry.kind === EntryKind.PATH) {
      shown = entry.shown;
      paths++;
    } else if (entry.kind === EntryKind.EMPTY) {
      shown = paths === 0 && entry.shown;
    }

    results[key] = {
      cursor: dragging ? "grabbing" : "pointer",
      top: dragging ? currentY[key] + delta : y,
      zIndex: dragging ? 1 : 0,
      left: shown ? "unset" : -3000,
      scale: dragging ? 1.05 : 1,
      shadow: dragging ? 8 : 0,
    };

    if (shown) {
      y += el.getBoundingClientRect().height / springs.scale.get() + MARGIN;
    }

    if (activeKey) {
      results[key].immediate = (k) =>
        (dragging && k !== "scale") || ["left", "zIndex", "cursor"].includes(k);
    }
  }

  return results;
};

const getEntryKey = (entry: SidebarEntry) => {
  if (entry.kind === EntryKind.GROUP) {
    return JSON.stringify([entry.name]);
  }

  if (entry.kind === EntryKind.PATH) {
    return JSON.stringify(["", entry.path]);
  }

  if (entry.kind === EntryKind.EMPTY) {
    return JSON.stringify([entry.group, ""]);
  }

  return "tail";
};

const isShown = (entry: SidebarEntry) => {
  if (entry.kind === EntryKind.PATH && !entry.shown) {
    return false;
  }

  if (entry.kind === EntryKind.EMPTY && !entry.shown) {
    return false;
  }

  if (entry.kind === EntryKind.TAIL) {
    return false;
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
  const data = [];
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
  const data = [];
  let current = { top: -MARGIN, height: 0, key: null };
  let activeHeight = -MARGIN;

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const entry = items[key].entry;

    if (entry.kind === EntryKind.TAIL) break;

    if (entry.kind === EntryKind.GROUP) {
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

const isTagEntry = (entry: SidebarEntry, excludeGroups: boolean = false) => {
  if (entry.kind === EntryKind.PATH) {
    return (
      entry.path.startsWith("tags.") || entry.path.startsWith("_label_tags.")
    );
  }

  if (entry.kind === EntryKind.EMPTY) {
    return entry.group === "tags" || entry.group === "label tags";
  }

  if (excludeGroups && entry.kind === EntryKind.GROUP) {
    return entry.name === "tags" || entry.name === "label tags";
  }

  return false;
};

const getAfterKey = (
  activeKey: string,
  items: InteractiveItems,
  order: string[],
  direction: Direction
): string | null => {
  if (!items[activeKey]) {
    return;
  }

  const up = direction === Direction.UP;
  const baseTop = items[order[0]].el.parentElement.getBoundingClientRect().y;
  const isGroup = items[activeKey].entry.kind === EntryKind.GROUP;
  let { data, activeHeight } = isGroup
    ? measureGroups(activeKey, items, order)
    : measureEntries(activeKey, items, order);

  data = data.filter(
    ({ key }) => !key || !isTagEntry(items[key].entry, !isGroup)
  );

  const { top } = items[activeKey].el.getBoundingClientRect();
  let y = top - baseTop;

  if (!up) {
    y += activeHeight;
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
      return !prev || !isTagEntry(items[prev].entry);
    });
  }

  let result = filtered[0].key;
  if (isGroup) {
    if (result === null) return null;

    let index = order.indexOf(result) + (up ? -1 : 1);
    if (result === activeKey) index--;
    if (index <= 0) return null;

    if (order[index] === activeKey) return activeKey;

    while (
      [EntryKind.PATH, EntryKind.GROUP].includes(items[order[index]].entry.kind)
    )
      index++;

    return order[index];
  }

  const first = order.filter((key) => !isTagEntry(items[key].entry, true))[0];
  if (order.indexOf(result) <= order.indexOf(first)) {
    if (up) return order[order.indexOf(first) + 1];
    return first;
  }

  return result;
};

type InteractiveItems = {
  [key: string]: {
    el: HTMLDivElement;
    controller: Controller;
    entry: SidebarEntry;
    active: boolean;
  };
};

enum Direction {
  UP = "UP",
  DOWN = "DOWN",
}

const SidebarColumn = styled.div`
  position: relative;
  max-height: 100%;
  height: 100%;
  width: 100%;

  overflow-y: scroll;
  overflow-x: hidden;

  scrollbar-color: ${({ theme }) => theme.fontDarkest}
    ${({ theme }) => theme.background};
  background: ${({ theme }) => theme.background};
  ${scrollbarStyles}

  scrollbar-width: none;
  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`;

const Container = styled.div`
  position: relative;
  overflow: visible;
  margin: 0 1rem;

  & > div {
    position: absolute;
    transform-origin: 50% 50% 0px;
    touch-action: none;
    width: 100%;
  }
`;

const InteractiveSidebar = ({
  before,
  entriesAtom,
  render,
}: {
  before?: React.ReactNode;
  entriesAtom: RecoilState<SidebarEntry[]>;
  render: (
    group: string,
    entry: SidebarEntry,
    controller: Controller,
    dragging: boolean
  ) => { children: React.ReactNode; disabled: boolean };
}) => {
  const [entries, setEntries] = useRecoilState(entriesAtom);
  const order = useRef<string[]>([]);
  const lastOrder = useRef<string[]>([]);
  const down = useRef<string>(null);
  const last = useRef<number>(null);
  const lastDirection = useRef<Direction>(null);
  const start = useRef<number>(0);
  const items = useRef<InteractiveItems>({});
  const container = useRef<HTMLDivElement>();
  const [isDragging, setIsDragging] = useState(false);
  const scroll = useRef<number>(0);
  const maxScrollHeight = useRef<number>();
  let group = null;
  order.current = entries.map((entry) => getEntryKey(entry));
  for (const entry of entries) {
    if (entry.kind === EntryKind.GROUP) {
      group = entry.name;
    }

    const key = getEntryKey(entry);

    if (!(key in items.current)) {
      items.current[key] = {
        el: null,
        controller: new Controller({
          cursor: "pointer",
          top: 0,
          zIndex: 0,
          left: "unset",
          scale: 1,
          shadow: 0,
        }),
        entry,
        active: false,
      };
    } else {
      items.current[key].entry = entry;
    }
  }

  const getNewOrder = (direction: Direction): string[] => {
    let after = getAfterKey(
      down.current,
      items.current,
      lastOrder.current,
      direction
    );

    let entry = items.current[down.current].entry;
    if (down.current === after && entry.kind === EntryKind.GROUP) {
      const ai = lastOrder.current.indexOf(after) - 1;
      after = ai >= 0 ? lastOrder.current[ai] : null;
    }

    let from = lastOrder.current.indexOf(down.current);
    let to = after ? lastOrder.current.indexOf(after) : 0;

    if (entry.kind === EntryKind.PATH) {
      to = Math.max(to, 1);
      return move(lastOrder.current, from, to);
    }

    const section = [];
    do {
      section.push(lastOrder.current[from]);
      from++;

      if (from >= order.current.length) break;

      entry = items.current[lastOrder.current[from]].entry;
    } while (entry.kind !== EntryKind.GROUP && entry.kind !== EntryKind.TAIL);

    if (after === null) {
      return [
        ...section,
        ...lastOrder.current.filter((key) => !section.includes(key)),
      ];
    }
    const result = [];
    const pool = lastOrder.current.filter((key) => !section.includes(key));
    let i = 0;
    let terminate = false;
    while (i < pool.length && !terminate) {
      result.push(pool[i]);
      terminate = pool[i] === after;
      i++;
    }

    return [...result, ...section, ...pool.slice(i)];
  };

  const placeItems = useCallback(() => {
    const placements = fn(items.current, order.current, order.current);
    for (const key of order.current) {
      const item = items.current[key];
      if (item.active) {
        item.controller.start(placements[key]);
      } else {
        item.controller.set(placements[key]);
        item.active = true;
      }
    }
  }, []);

  const exit = useCallback((event) => {
    setIsDragging(false);
    if (start.current === event.clientY || down.current == null) {
      down.current = null;
      start.current = null;
      return;
    }

    requestAnimationFrame(() => {
      const newOrder = getNewOrder(lastDirection.current);
      order.current = newOrder;
      setEntries(order.current.map((key) => items.current[key].entry));
      down.current = null;
      start.current = null;
      lastDirection.current = null;
    });
  }, []);

  useEventHandler(document.body, "mouseup", exit);
  useEventHandler(document.body, "mouseleave", exit);

  const scrollWith = useCallback((direction: Direction, y: number) => {
    const { top, bottom, height } = container.current.getBoundingClientRect();
    const up = direction === Direction.UP;
    let delta = up ? y - top : bottom - y;
    const canScroll = up
      ? scroll.current > 0
      : scroll.current + height < maxScrollHeight.current;

    if (down.current && canScroll && delta < 24) {
      container.current.scroll(0, container.current.scrollTop + (up ? -1 : 1));
      requestAnimationFrame(() => scrollWith(direction, y));
    }
  }, []);

  const animate = useCallback((y) => {
    if (down.current == null) return;
    const entry = items.current[down.current].entry;

    const d = y - last.current;

    if (d > 0) {
      lastDirection.current = Direction.DOWN;
    } else if (d < 0 || !lastDirection.current) {
      lastDirection.current = Direction.UP;
    }

    if (![EntryKind.PATH, EntryKind.GROUP].includes(entry.kind)) return;
    requestAnimationFrame(() => {
      const realDelta = y - start.current;
      const newOrder = getNewOrder(lastDirection.current);
      const results = fn(
        items.current,
        order.current,
        newOrder,
        down.current,
        realDelta
      );
      for (const key of order.current)
        items.current[key].controller.start(results[key]);

      last.current = y;
      lastOrder.current = newOrder;
    });
  }, []);

  useEventHandler(document.body, "mousemove", ({ clientY }) => {
    if (down.current) {
      !isDragging && setIsDragging(true);
      scrollWith(lastDirection.current, clientY);
    }
    animate(clientY);
  });

  const trigger = useCallback((event) => {
    if (event.button !== 0) return;

    down.current = event.currentTarget.dataset.key;
    start.current = event.clientY;
    last.current = start.current;
    lastOrder.current = order.current;
    maxScrollHeight.current = container.current.scrollHeight;
  }, []);

  const [observer] = useState<ResizeObserver>(
    () => new ResizeObserver(placeItems)
  );

  return (
    <SidebarColumn
      ref={container}
      onScroll={({ target }) => {
        if (start.current !== null) {
          start.current += scroll.current - target.scrollTop;
        }

        scroll.current = target.scrollTop;
        down.current && animate(last.current);
      }}
    >
      {before}
      <Container>
        {order.current.map((key) => {
          const entry = items.current[key].entry;
          if (entry.kind === EntryKind.GROUP) {
            group = entry.name;
          }

          const { shadow, cursor, ...springs } = items.current[
            key
          ].controller.springs;
          const { children, disabled } = render(
            group,
            entry,
            items.current[key].controller,
            isDragging
          );

          return (
            <animated.div
              data-key={key}
              onMouseDown={disabled ? null : trigger}
              ref={(node) => {
                items.current[key].el &&
                  observer.unobserve(items.current[key].el);
                node && observer.observe(node);
                items.current[key].el = node;
              }}
              key={key}
              style={{
                ...springs,
                boxShadow: shadow.to(
                  (s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`
                ),
                cursor: disabled ? "unset" : cursor,
              }}
            >
              {children}
            </animated.div>
          );
        })}
      </Container>
    </SidebarColumn>
  );
};

export default React.memo(InteractiveSidebar);
