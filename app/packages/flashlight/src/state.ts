/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export type Optional<T> = {
  [P in keyof T]?: Optional<T[P]>;
};

export interface Section {
  getTop: () => number;
  getHeight: () => number;
  index: number;
  set: (margin: number, top: number, width: number) => void;
  show: () => void;
  hide: () => void;
  target: HTMLDivElement;
  isShown: () => boolean;
  getItems: () => string[];
}

export interface ItemData {
  id: string;
  aspectRatio: number;
}

export interface RowData {
  items: ItemData[];
  aspectRatio: number;
  extraMargins?: number;
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
  options: Options;
  activeSection: number;
  clean: Set<number>;
  updater?: (id: string) => void;
  shownSections: Set<number>;
}
