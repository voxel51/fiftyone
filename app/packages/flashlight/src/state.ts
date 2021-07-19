/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export type Optional<T> = {
  [P in keyof T]?: Optional<T[P]>;
};

export interface Section {
  show: (margin: number, top: number, width: number) => void;
  hide: () => void;
  target: HTMLDivElement;
  isShown: () => boolean;
}

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

export type Render = (id: string, HTMLDivElement) => void;

export interface Options {
  margin: number;
  rowAspectRatioThreshold: number;
}

export interface State<K> {
  get: Get<K>;
  render: Render;
  containerHeight: number;
  width: number;
  height: number;
  currentRequestKey: K;
  currentRemainder: ItemData[];
  currentRowRemainder: RowData[];
  items: ItemData[];
  sections: Section[];
  sectionMap: Map<HTMLDivElement, Section>;
  topMap: Map<HTMLDivElement, number>;
  options: Options;
}
