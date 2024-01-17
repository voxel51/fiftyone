/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import Row, { ItemData, Render } from "./row";

export interface Response<K> {
  items: ItemData[];
  nextRequestKey: K | null;
}

export type Get<K> = (key: K) => Promise<Response<K>>;

export type ItemIndexMap = { [key: string]: number };

export interface Options {
  rowAspectRatioThreshold: number;
}

export interface Edge<K> {
  key: K;
  remainder: ItemData[];
}

export interface State<K> {
  get: Get<K>;
  render: Render;
  containerHeight: number;
  width: number;
  height: number;
  start?: Edge<K>;
  end?: Edge<K>;
  rows: Row[];
  options: Options;
  firstSection: number;
  lastSection: number;
}
