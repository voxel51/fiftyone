import { Controller, animated, config } from "@react-spring/web";
import React, { Suspense, useCallback, useRef, useState } from "react";
import styled from "styled-components";

import { move } from "@fiftyone/utilities";

import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useEventHandler, replace } from "@fiftyone/state";
import { scrollbarStyles } from "@fiftyone/utilities";
import { Box } from "@mui/material";
import { Resizable } from "re-resizable";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import SchemaSettings from "../Schema/SchemaSettings";
import Filter from "./Entries/FilterEntry";
import { resizeHandle } from "./Sidebar.module.css";
import ViewSelection from "./ViewSelection";

const MARGIN = 3;

const fn = (
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
    const w = items[activeKey].el.parentElement.getBoundingClientRect().width;
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
  let current = {
    top: -MARGIN,
    height: 0,
    key: getEntryKey(items[order[0]].entry),
  };
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

const isDisabledEntry = (
  entry: fos.SidebarEntry,
  disabled: Set<string>,
  excludeGroups = false
) => {
  if (entry.kind === fos.EntryKind.PATH) {
    return (
      entry.path.startsWith("tags.") ||
      entry.path.startsWith("_label_tags.") ||
      disabled.has(entry.path)
    );
  }

  if (entry.kind === fos.EntryKind.EMPTY) {
    return entry.group === "tags" || entry.group === "label tags";
  }

  if (excludeGroups && entry.kind === fos.EntryKind.GROUP) {
    return (
      entry.name === "tags" ||
      entry.name === "label tags" ||
      entry.name === "other"
    );
  }

  if (entry.kind === fos.EntryKind.INPUT) {
    return true;
  }

  return false;
};

const getAfterKey = (
  activeKey: string,
  items: InteractiveItems,
  order: string[],
  direction: Direction,
  disabled: Set<string>
): string | null => {
  if (!items[activeKey]) {
    return;
  }

  const up = direction === Direction.UP;
  const baseTop = items[order[0]].el.parentElement.getBoundingClientRect().y;
  const isGroup = items[activeKey].entry.kind === fos.EntryKind.GROUP;
  let { data, activeHeight } = isGroup
    ? measureGroups(activeKey, items, order)
    : measureEntries(activeKey, items, order);

  data = data.filter(
    ({ key }) => !isDisabledEntry(items[key].entry, disabled, !isGroup)
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

type InteractiveItems = {
  [key: string]: {
    el: HTMLDivElement;
    controller: Controller;
    entry: fos.SidebarEntry;
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
  width: 100%;
  flex: 1;

  overflow-y: scroll;
  overflow-x: hidden;

  scrollbar-color: ${({ theme }) => theme.text.tertiary}
    ${({ theme }) => theme.background.body};
  background: ${({ theme }) => theme.background.sidebar};
  ${scrollbarStyles}
`;

const Container = animated(styled.div`
  position: relative;
  min-height: 100%;
  margin: 0 0.25rem 0 1rem;

  & > div {
    position: absolute;
    transform-origin: 50% 50% 0px;
    touch-action: none;
    width: 100%;
  }
`);

type RenderEntry = (
  key: string,
  group: string,
  entry: fos.SidebarEntry,
  controller: Controller,
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void
) => { children: React.ReactNode; disabled: boolean };

const InteractiveSidebar = ({
  render,
  modal,
}: {
  render: RenderEntry;
  modal: boolean;
}) => {
  const order = useRef<string[]>([]);
  const lastOrder = useRef<string[]>([]);
  const down = useRef<string>(null);
  const last = useRef<number>(null);
  const lastDirection = useRef<Direction>(null);
  const start = useRef<number>(0);
  const items = useRef<InteractiveItems>({});
  const container = useRef<HTMLDivElement>();
  const scroll = useRef<number>(0);
  const maxScrollHeight = useRef<number>();
  const [width, setWidth] = useRecoilState(fos.sidebarWidth(modal));
  const resetWidth = useResetRecoilState(fos.sidebarWidth(modal));
  const shown = useRecoilValue(fos.sidebarVisible(modal));
  const [entries, setEntries] = fos.useEntries(modal);
  const disabled = useRecoilValue(fos.disabledPaths);
  const cb = useRef<() => void>();
  const [containerController] = useState(
    () => new Controller({ minHeight: 0 })
  );

  const modalContainer = document.getElementById("modal");

  if (entries instanceof Error) {
    throw entries;
  }

  let group = null;
  order.current = [...entries].map((entry) => getEntryKey(entry));
  for (const entry of entries) {
    const key = getEntryKey(entry);
    if (entry.kind === fos.EntryKind.GROUP) {
      group = entry.name;
    }

    if (entry.kind === fos.EntryKind.GROUP && entry.name in replace) {
      const oldKey = getEntryKey({ ...entry, name: replace[entry.name] });
      items.current[key] = items.current[oldKey];

      items.current = Object.fromEntries(
        Object.entries(items.current).filter(([k]) => k !== oldKey)
      );
      items.current[key].entry = entry;
    } else if (entry.kind === fos.EntryKind.EMPTY && entry.group in replace) {
      const oldKey = getEntryKey({ ...entry, group: replace[entry.group] });
      items.current[key] = items.current[oldKey];

      items.current = Object.fromEntries(
        Object.entries(items.current).filter(([k]) => k !== oldKey)
      );
      items.current[key].entry = entry;
      delete replace[entry.group];
    } else if (!(key in items.current)) {
      items.current[key] = {
        el: null,
        controller: new Controller({
          cursor: "pointer",
          top: -3000,
          left: 0,
          zIndex: 0,
          scale: 1,
          shadow: 0,
          height: 0,
          config: {
            ...config.stiff,
            bounce: 0,
          },
          onRest: () => {
            // fires event for e2e testing to avoid using onWait
            if (container?.current) {
              container?.current.dispatchEvent(
                new CustomEvent("animation-onRest", {
                  bubbles: true,
                })
              );
            }
          },
          overflow: "visible",
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
      direction,
      disabled
    );

    let entry = items.current[down.current].entry;
    if (down.current === after && entry.kind === fos.EntryKind.GROUP) {
      const ai = lastOrder.current.indexOf(after) - 1;
      after = ai >= 0 ? lastOrder.current[ai] : null;
    }

    let from = lastOrder.current.indexOf(down.current);
    let to = after ? lastOrder.current.indexOf(after) : 0;
    if (entry.kind === fos.EntryKind.PATH) {
      to = Math.max(to, 1);
      return move(lastOrder.current, from, to);
    }

    const section = [];
    do {
      section.push(lastOrder.current[from]);
      from++;

      if (from >= order.current.length) break;

      entry = items.current[lastOrder.current[from]].entry;
    } while (
      entry.kind !== fos.EntryKind.GROUP &&
      entry.kind !== fos.EntryKind.INPUT
    );

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
  const lastTouched = useRef<string>();

  const placeItems = useCallback(() => {
    const { results: placements, minHeight } = fn(
      items.current,
      order.current,
      order.current,
      null,
      0,
      lastTouched.current
    );

    containerController.set({ minHeight: minHeight + MARGIN });
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

  const exit = useCallback(() => {
    if (down.current === null) {
      start.current = null;
      cb.current = null;
      return;
    }

    requestAnimationFrame(() => {
      cb.current();

      lastTouched.current = down.current;
      const newOrder = getNewOrder(lastDirection.current);
      order.current = newOrder;

      const newEntries = order.current.map((key) => items.current[key].entry);

      cb.current = null;
      down.current = null;
      start.current = null;
      lastDirection.current = null;

      setEntries(newEntries);
    });
  }, [entries]);

  useEventHandler(document.body, "mouseup", exit);
  useEventHandler(document.body, "mouseleave", exit);

  const scrollWith = useCallback((direction: Direction, y: number) => {
    requestAnimationFrame(() => {
      const { top, bottom, height } = container.current.getBoundingClientRect();
      const up = direction === Direction.UP;
      const delta = up ? y - top : bottom - y;
      const canScroll = up
        ? scroll.current > 0
        : scroll.current + height < maxScrollHeight.current;

      if (down.current && canScroll && delta < 24) {
        container.current.scroll(
          0,
          container.current.scrollTop + (up ? -1 : 1)
        );
        animate(y);
        scrollWith(direction, y);
      }
    });
  }, []);

  const animate = useCallback((y) => {
    if (down.current == null) return;
    document.getSelection().removeAllRanges();
    const entry = items.current[down.current].entry;

    const d = y - last.current;

    if (d > 0) {
      lastDirection.current = Direction.DOWN;
    } else if (d < 0 || !lastDirection.current) {
      lastDirection.current = Direction.UP;
    }

    if (![fos.EntryKind.PATH, fos.EntryKind.GROUP].includes(entry.kind)) return;
    const realDelta = y - start.current;
    const newOrder = getNewOrder(lastDirection.current);
    const { results, minHeight } = fn(
      items.current,
      order.current,
      newOrder,
      down.current,
      realDelta
    );
    containerController.set({ minHeight: minHeight + MARGIN });

    for (const key of order.current)
      items.current[key].controller.start(results[key]);

    last.current = y;
    lastOrder.current = newOrder;
  }, []);

  useEventHandler(document.body, "mousemove", ({ clientY }) => {
    if (!down.current) return;

    // do not allow dragging sample tags and label tags
    const entry = items.current[down.current].entry;
    if (["_label_tags", "tags"].includes(entry.path)) return;

    requestAnimationFrame(() => {
      animate(clientY);
      scrollWith(lastDirection.current, clientY);
    });
  });

  const trigger = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement>,
      key: string,
      callback: () => void
    ) => {
      if (event.button !== 0) return;

      down.current = key;
      cb.current = callback;
      start.current = event.clientY;
      last.current = start.current;
      lastOrder.current = order.current;
      maxScrollHeight.current = container.current.scrollHeight;
      lastTouched.current = null;
      placeItems();
    },
    [placeItems]
  );

  const [observer] = useState<ResizeObserver>(
    () => new ResizeObserver(placeItems)
  );
  const theme = useTheme();
  const resizableSide = modal ? "left" : "right";

  return shown ? (
    <Resizable
      data-cy="sidebar"
      size={{ height: "100%", width }}
      minWidth={200}
      maxWidth={600}
      enable={{
        top: false,
        right: !modal,
        bottom: false,
        left: modal,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, { width: delta }) => {
        setWidth(width + delta);
        // reset sidebar to default width on double click
        if (e.detail === 2) resetWidth();
      }}
      style={{
        borderLeft: modal
          ? `1px solid ${theme.primary.plainBorder}`
          : undefined,
        borderRight: !modal
          ? `1px solid ${theme.primary.plainBorder}`
          : undefined,
        borderTopRightRadius: 8,
        display: "flex",
        flexDirection: "column",
      }}
      handleStyles={{
        [resizableSide]: { right: 0, width: 4 },
      }}
      handleClasses={{
        [resizableSide]: resizeHandle,
      }}
    >
      {modalContainer && <SchemaSettings />}
      {!modal && (
        <Suspense>
          <Box
            style={{
              padding: 8,
              paddingLeft: 16,
              paddingRight: 16,
              background: theme.background.mediaSpace,
              borderTopRightRadius: 8,
            }}
          >
            <ViewSelection id="saved-views" />
          </Box>
        </Suspense>
      )}
      <Suspense>
        <Filter modal={modal} />
        <SidebarColumn
          ref={container}
          data-cy="sidebar-column"
          onScroll={({ target }) => {
            if (start.current !== null) {
              start.current += scroll.current - target.scrollTop;
            }

            scroll.current = target.scrollTop;
            down.current && animate(last.current);
          }}
        >
          <Container style={containerController.springs}>
            {order.current.map((key) => {
              const entry = items.current[key].entry;
              if (entry.kind === fos.EntryKind.GROUP) {
                group = entry.name;
              }

              const { shadow, cursor, ...springs } =
                items.current[key].controller.springs;
              const keyTrigger = ["tags", "_label_tags"].includes(key[1])
                ? null
                : trigger;
              const { children } = render(
                key,
                group,
                entry,
                items.current[key].controller,
                keyTrigger
              );
              const style = {};
              if (entry.kind === fos.EntryKind.INPUT) {
                style.zIndex = 0;
              }

              return (
                <animated.div
                  onMouseDownCapture={() => {
                    lastTouched.current = undefined;
                    placeItems();
                  }}
                  key={key}
                  style={{
                    ...springs,
                    boxShadow: shadow.to(
                      (s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`
                    ),
                    ...style,
                  }}
                >
                  <div
                    ref={(node) => {
                      if (!items.current[key]) {
                        return;
                      }

                      items.current[key].el &&
                        observer.unobserve(items.current[key].el);
                      node && observer.observe(node);
                      items.current[key].el = node;
                    }}
                  >
                    {children}
                  </div>
                </animated.div>
              );
            })}
          </Container>
        </SidebarColumn>
      </Suspense>
    </Resizable>
  ) : null;
};

export default React.memo(InteractiveSidebar);
