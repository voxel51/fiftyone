/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The server order a grid pages: opened once per view, sort and refresh,
 * shared by the pager that pages it and the rail that shows it.
 */

import * as foq from "@fiftyone/relay";
import { fetchQuery } from "react-relay";
import type { IEnvironment } from "relay-runtime";
import type { OrderMode } from "../Grid/pageCursors";

export type OrderInput = foq.openOrderQuery$variables["input"];

export type OrderScale = "NUMBER" | "DATE" | "ID";

export interface OrderTick {
  fraction: number;
  label: string;
}

export interface OrderBounds {
  min: unknown;
  max: unknown;
  /** Null for strings and booleans, which seek by value only */
  scale: OrderScale | null;
}

export interface Order {
  kind: "order";
  token: string;
  mode: OrderMode;
  /** SMALL only */
  total: number | null;
  /** INDEXED only */
  bounds: OrderBounds | null;
  desc: boolean;
  ticks: OrderTick[];
}

/** The view cannot be ordered (e.g. a similarity sort): it pages by skip. */
export interface Unordered {
  kind: "unordered";
}

export type OpenedOrder = Order | Unordered;

const UNORDERED: Unordered = { kind: "unordered" };

const MODES = new Set<string>(["SMALL", "INDEXED", "SCROLL"]);
const SCALES = new Set<string>(["NUMBER", "DATE", "ID"]);

export const toOrder = (
  data: foq.openOrderQuery$data,
  desc: boolean,
): OpenedOrder => {
  const opened = data.openOrder;
  if (opened.__typename !== "Order" || !MODES.has(opened.mode)) {
    return UNORDERED;
  }

  const scale = opened.bounds?.scale;
  return {
    kind: "order",
    token: String(opened.token),
    mode: opened.mode as OrderMode,
    total: opened.total,
    bounds: opened.bounds && {
      min: opened.bounds.min,
      max: opened.bounds.max,
      scale: scale && SCALES.has(scale) ? (scale as OrderScale) : null,
    },
    desc,
    ticks: opened.ticks.map(({ fraction, label }) => ({ fraction, label })),
  };
};

/** Opens an order; one the server cannot open pages by skip instead. */
export const openOrder = (
  environment: IEnvironment,
  input: OrderInput,
  signal: AbortSignal,
) =>
  new Promise<OpenedOrder>((resolve) => {
    const subscription = fetchQuery<foq.openOrderQuery>(
      environment,
      foq.openOrder,
      { input },
      { fetchPolicy: "network-only" },
    ).subscribe({
      next: (data) => resolve(toOrder(data, Boolean(input.desc))),
      error: () => resolve(UNORDERED),
    });
    signal.addEventListener("abort", () => subscription.unsubscribe());
  });

/** An order opened on first read, whose result listeners hear. */
export interface OrderHolder {
  get(): Promise<OpenedOrder>;
  readonly current: OpenedOrder | undefined;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export const createOrderHolder = (
  open: (signal: AbortSignal) => Promise<OpenedOrder>,
): OrderHolder => {
  const controller = new AbortController();
  const listeners = new Set<() => void>();
  let promise: Promise<OpenedOrder> | undefined;
  let current: OpenedOrder | undefined;

  return {
    get() {
      promise ??= open(controller.signal).then((order) => {
        current = order;
        listeners.forEach((listener) => listener());
        return order;
      });
      return promise;
    },
    get current() {
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose: () => controller.abort(),
  };
};
