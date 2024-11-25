export interface QParamT {
  toVariable: (input: any) => any;
  topKey: string;
  nestedKey?: string;
}

export type PARAMS_T =
  | "page"
  | "pageSize"
  | "order.field"
  | "order.direction"
  | "mediaType"
  | "createdBy"
  | "search";

export const PARAMS: {
  [id: string]: PARAMS_T;
} = {
  PAGE: "page",
  PAGE_SIZE: "pageSize",
  ORDER_FIELD: "order.field",
  ORDER_DIRECTION: "order.direction",
  MEDIA_TYPE: "mediaType",
  CREATED_BY: "createdBy",
  SEARCH: "search",
};
