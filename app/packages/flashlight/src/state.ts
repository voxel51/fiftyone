/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

export interface Section {
  getTop: () => number;
  getBottom: () => number;
  getHeight: () => number;
  index: number;
  itemIndex: number;
  set: (top: number, width: number) => void;
  show: (element: HTMLDivElement, hidden: boolean, soft: boolean) => void;
  hide: () => void;
  isShown: () => boolean;
  getItems: () => ItemData[];
  resizeItems: (resizer: OnItemResize) => void;
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
  nextRequestKey: K | null;
}

export type Get<K> = (key: K) => Promise<Response<K>>;

export type ItemIndexMap = { [key: string]: number };

export type OnItemClick = (
  next: () => Promise<void>,
  id: string,
  itemIndexMap: ItemIndexMap,
  event: MouseEvent
) => void;

export type Render = (
  id: string,
  element: HTMLDivElement,
  dimensions: [number, number],
  soft: boolean,
  disable: boolean
) => (() => void) | void;

export type OnItemResize = (id: string, dimensions: [number, number]) => void;

export interface Options {
  rowAspectRatioThreshold: number;
  offset: number;
  selectedMediaFieldName: string;
}

export type OnResize = (width: number) => Partial<Options>;

export interface State<K> {
  get: Get<K>;
  render: Render;
  containerHeight: number;
  width: number;
  height: number;
  currentRequestKey: K | null;
  currentRemainder: ItemData[];
  currentRowRemainder: RowData[];
  items: ItemData[];
  sections: Section[];
  options: Options;
  activeSection: number;
  firstSection: number;
  lastSection: number;
  clean: Set<number>;
  updater?: (id: string) => void;
  shownSections: Set<number>;
  onItemClick?: OnItemClick;
  onItemResize?: OnItemResize;
  onResize?: OnResize;
  nextItemIndex: number;
  itemIndexMap: ItemIndexMap;
  resized?: Set<number>;
  resizing: boolean;
}
