/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type Spotlight from "./index";

export interface At {
  description: string;
  offset?: number;
}

export interface Edge<K, V> {
  key: K | null;
  remainder?: ItemData<K, V>[];
}

export type Focus = (id?: ID) => ID | undefined;

export type Get<K, V> = (key: K) => Promise<Response<K, V>>;

export type Hide = (ctx: { id: ID }) => void;

export type ItemClick<K, V> = (
  callbackInterface: ItemClickInterface<K, V>
) => void;

export interface ItemClickInterface<K, V> {
  event: MouseEvent;
  item: ItemData<K, V>;
  iter: { next: (from: number, soft?: boolean) => Promise<ID | undefined> };
}

export type ID = { description: string };
export interface ItemData<K, V> {
  aspectRatio: number;
  data: V;
  id: ID;
  key: K;
}

export type Measure<K, V> = (
  id: ItemData<K, V>,
  sizeBytes: Promise<number>
) => void;

export interface Response<K, V> {
  items: ItemData<K, V>[];
  next: K | null;
  previous: K | null;
}

export type Request<K, V> = (key: K) => Promise<{
  items: ItemData<K, V>[];
  focus: Focus;
  next?: K;
  previous?: K;
}>;

export type Show<K, V> = (ctx: {
  id: ID;
  dimensions: [number, number];
  element: HTMLDivElement;
  spotlight: Spotlight<K, V>;
  zooming: boolean;
}) => Promise<number>;

export interface SpotlightConfig<K, V> {
  at?: At;
  key: K;
  maxRows?: number;
  maxItemsSizeBytes?: number;
  offset?: number;
  scrollbar?: boolean;
  spacing?: number;

  detachItem: (id: ID) => void;
  get: Get<K, V>;
  getItemSizeBytes?: (id: ID) => number;
  hideItem: Hide;
  onItemClick?: ItemClick<K, V>;
  rowAspectRatioThreshold: (width: number) => number;
  showItem: Show<K, V>;
}

export type Updater = (id: ID) => void;
