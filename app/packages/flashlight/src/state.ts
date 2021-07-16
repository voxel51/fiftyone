/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export interface ItemData {
  id: string;
  aspectRatio: number;
}

export interface RowData {
  items: ItemData[];
  aspectRatio: number;
}

export interface Response<K> {
  items: ItemData[];
  nextRequestKey?: K;
}

export type Get<K> = (key: K) => Promise<Response<K>>;

export interface State<K> {
  get: Get<K>;
  width: number;
  height: number;
}
