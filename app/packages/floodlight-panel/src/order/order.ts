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

/** The page arguments an order's first page was read with. */
export interface FirstPageArgs {
  count: number;
  filter: unknown;
  paginationData: boolean;
  maxQueryTime: number | null;
}

/** The first page an open returned, until the pager takes it. */
export interface FirstPage {
  args: FirstPageArgs;
  connection: foq.PaginateSamplesConnection;
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
  /** Read with the open; the first read of the start page takes it. */
  first?: FirstPage;
}

/** The view cannot be ordered (e.g. a similarity sort): it pages by skip. */
export interface Unordered {
  kind: "unordered";
}

export type OpenedOrder = Order | Unordered;

export const UNORDERED: Unordered = { kind: "unordered" };

/** The arguments of a start page's `samples` variables a first page needs. */
export const firstPageArgs = (
  variables: Record<string, unknown>,
): FirstPageArgs => ({
  count: variables.count as number,
  filter: variables.filter ?? null,
  paginationData: (variables.paginationData as boolean | undefined) ?? true,
  maxQueryTime: (variables.maxQueryTime as number | null | undefined) ?? null,
});

const MODES = new Set<string>(["SMALL", "INDEXED", "SCROLL"]);
const SCALES = new Set<string>(["NUMBER", "DATE", "ID"]);

export const toOrder = (
  data: foq.openOrderQuery$data,
  desc: boolean,
  args?: FirstPageArgs,
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
    // the same selection as paginateSamplesQuery's connection
    first:
      args && opened.firstPage
        ? {
            args,
            connection: {
              __typename: "SampleItemStrConnection",
              ...opened.firstPage,
            } as unknown as foq.PaginateSamplesConnection,
          }
        : undefined,
  };
};

/**
 * Opens an order; one the server cannot open pages by skip instead. With
 * `first`, the open also reads the order's first page; an open that fails
 * with it (a server without it) opens again without it.
 */
export const openOrder = (
  environment: IEnvironment,
  input: OrderInput,
  signal: AbortSignal,
  first?: FirstPageArgs,
): Promise<OpenedOrder> =>
  new Promise<OpenedOrder>((resolve) => {
    const subscription = fetchQuery<foq.openOrderQuery>(
      environment,
      foq.openOrder,
      first
        ? {
            input,
            withFirstPage: true,
            count: first.count,
            filter: first.filter as foq.openOrderQuery$variables["filter"],
            paginationData: first.paginationData,
            maxQueryTime: first.maxQueryTime,
          }
        : { input },
      { fetchPolicy: "network-only" },
    ).subscribe({
      next: (data) => resolve(toOrder(data, Boolean(input.desc), first)),
      error: () =>
        resolve(
          first && !signal.aborted
            ? openOrder(environment, input, signal)
            : UNORDERED,
        ),
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
