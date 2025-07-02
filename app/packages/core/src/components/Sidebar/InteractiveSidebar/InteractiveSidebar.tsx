import * as fos from "@fiftyone/state";
import { useEventHandler } from "@fiftyone/state";
import { Controller, animated, config } from "@react-spring/web";
import React, { useCallback, useRef, useState } from "react";
import { Container, SidebarColumn } from "./Components";
import style from "./style.module.css";
import type { InteractiveItems, RenderEntry } from "./types";
import useAnimate from "./useAnimate";
import useExit from "./useExit";
import useGetNewOrder from "./useGetNewOrder";
import { Direction, MARGIN, fn, getEntryKey } from "./utils";

const InteractiveSidebar = ({
  isDisabled,
  render,
  useEntries,
}: {
  isDisabled: (entry: fos.SidebarEntry) => boolean;
  render: RenderEntry;
  useEntries: () => [fos.SidebarEntry[], (entries: fos.SidebarEntry[]) => void];
}) => {
  const cb = useRef<(() => void) | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const down = useRef<string | null>(null);
  const items = useRef<InteractiveItems>({});
  const order = useRef<string[]>([]);
  const lastOrder = useRef<string[]>([]);
  const last = useRef<number | null>(null);
  const lastDirection = useRef<Direction | null>(null);
  const lastTouched = useRef<string | null>(null);
  const maxScrollHeight = useRef<number | null>(null);
  const scroll = useRef<number>(0);
  const start = useRef<number | null>(0);
  const [controller] = useState(() => new Controller({ minHeight: 0 }));

  const [entries, setEntries] = useEntries();

  if (entries instanceof Error) {
    throw entries;
  }

  let group: string;
  order.current = [...entries].map((entry) => getEntryKey(entry));
  for (const entry of entries) {
    const key = getEntryKey(entry);
    if (entry.kind === fos.EntryKind.GROUP) {
      group = entry.name;
    }

    if (key in items.current) {
      items.current[key].entry = entry;
    } else {
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
    }
  }

  const placeItems = useCallback(() => {
    const { results: placements, minHeight } = fn(
      items.current,
      order.current,
      order.current,
      null,
      0,
      lastTouched.current
    );

    controller.set({ minHeight: minHeight + MARGIN });
    for (const key of order.current) {
      const item = items.current[key];

      if (item.active) {
        item.controller.start(placements[key]);
      } else {
        item.controller.set(placements[key]);
        item.active = true;
      }
    }
  }, [controller]);
  const [observer] = useState<ResizeObserver>(
    () => new ResizeObserver(placeItems)
  );

  const getNewOrder = useGetNewOrder({
    down,
    isDisabled,
    items,
    lastOrder,
    order,
  });
  const animate = useAnimate({
    controller,
    down,
    getNewOrder,
    items,
    last,
    lastDirection,
    lastOrder,
    order,
    start,
  });

  const scrollWith = useCallback(
    (direction: Direction, y: number) => {
      requestAnimationFrame(() => {
        const rect = container.current?.getBoundingClientRect();
        if (!rect) {
          return;
        }
        const { top, bottom, height } = rect;
        const up = direction === Direction.UP;
        const delta = up ? y - top : bottom - y;
        const canScroll = up
          ? scroll.current > 0
          : scroll.current + height < (maxScrollHeight.current ?? 0);

        if (down.current && canScroll && delta < 24) {
          container.current?.scroll(
            0,
            container.current.scrollTop + (up ? -1 : 1)
          );
          animate(y);
          scrollWith(direction, y);
        }
      });
    },
    [animate]
  );

  useEventHandler(document.body, "mousemove", ({ clientY }) => {
    if (!down.current) return;

    requestAnimationFrame(() => {
      animate(clientY);
      lastDirection.current && scrollWith(lastDirection.current, clientY);
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
      maxScrollHeight.current = container.current?.scrollHeight ?? 0;
      lastTouched.current = null;
      placeItems();
    },
    [placeItems]
  );

  useExit({
    cb,
    down,
    getNewOrder,
    items,
    last,
    lastDirection,
    lastTouched,
    order,
    start,
    setEntries,
  });

  return (
    <SidebarColumn
      ref={container}
      data-cy="sidebar-column"
      onScroll={() => {
        const scrollTop = container.current?.scrollTop ?? 0;
        if (start.current !== null) {
          start.current += scroll.current - (scrollTop ?? 0);
        }

        scroll.current = scrollTop ?? 0;
        down.current && animate(last.current);
      }}
    >
      <Container className={style.sidebar} style={controller.springs}>
        {order.current.map((key) => {
          const entry = items.current[key].entry;
          if (entry.kind === fos.EntryKind.GROUP) {
            group = entry.name;
          }

          const { shadow, ...springs } = items.current[key].controller.springs;

          const { children } = render(
            key,
            group,
            entry,
            items.current[key].controller,
            trigger
          );
          const style = entry.kind === fos.EntryKind.INPUT ? { zIndex: 0 } : {};

          let dataCy = "-field";
          if (entry.kind === fos.EntryKind.GROUP) {
            dataCy = `sidebar-group-${entry.name}${dataCy}`;
          } else if (entry.kind === fos.EntryKind.PATH) {
            dataCy = entry.path + dataCy;
          } else {
            dataCy = `sidebar${dataCy}`;
          }

          return (
            <animated.div
              data-cy={dataCy}
              onMouseDownCapture={() => {
                lastTouched.current = null;
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

                  const el = items.current[key].el;
                  el && observer.unobserve(el);
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
  );
};

export default React.memo(InteractiveSidebar);
