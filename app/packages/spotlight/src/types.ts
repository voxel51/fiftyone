/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

export interface Edge<K, V> {
  key: K | null;
  remainder?: ItemData<K, V>[];
}

export type Get<K, V> = (key: K) => Promise<Response<K, V>>;

export interface ItemData<K, V> {
  id: symbol;
  key: K;
  aspectRatio: number;
  data: V;
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

export interface SpotlightConfig<K, V> {
  get: Get<K, V>;
  key: K;
  margin?: number;
  offset?: number;
  onItemClick?: (callbackInterface: {
    event: MouseEvent;
    item: ItemData<K, V>;
  }) => void;
  render: Render;
  rowAspectRatioThreshold: number;
  spacing?: number;
}

export type Updater = (id: symbol) => void;
