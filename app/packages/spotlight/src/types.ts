/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

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

export type Render = (
  id: ID,
  element: HTMLDivElement,
  dimensions: [number, number],
  zooming: boolean
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

export interface SpotlightConfig<K, V> {
  at?: At;
  destroy?: (id: ID) => void;
  detach?: (id: ID) => void;
  get: Get<K, V>;
  key: K;
  offset?: number;
  onItemClick?: ItemClick<K, V>;
  render: Render;
  retainItems: boolean;
  rowAspectRatioThreshold: (width: number) => number;
  spacing?: number;
  scrollbar?: boolean;
}

export type Updater = (id: ID) => void;
