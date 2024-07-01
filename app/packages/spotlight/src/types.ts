/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

export interface Edge<K, V> {
  key: K | null;
  remainder?: ItemData<K, V>[];
}

export type Focus = (id?: symbol) => symbol | undefined;

export type Get<K, V> = (key: K) => Promise<Response<K, V>>;

export interface ItemData<K, V> {
  aspectRatio: number;
  data: V;
  id: symbol;
  key: K;
  next: symbol;
  previous: symbol;
}

export type Render = (
  id: symbol,
  element: HTMLDivElement,
  dimensions: [number, number],
  soft: boolean,
  disable: boolean
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

export interface ItemClickInterface<K, V> {
  event: MouseEvent;
  item: ItemData<K, V>;
  next: (from: number) => Promise<symbol | undefined>;
}

export type ItemClick<K, V> = (
  callbackInterface: ItemClickInterface<K, V>
) => boolean;

export interface SpotlightConfig<K, V> {
  get: Get<K, V>;
  key: K;
  margin?: number;
  offset?: number;
  onItemClick?: ItemClick<K, V>;
  render: Render;
  rowAspectRatioThreshold: number;
  spacing?: number;
  scrollbar?: boolean;
}

export type Updater = (id: symbol) => void;
