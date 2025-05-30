export type PCDFieldType = "F" | "I" | "U";

export type ProgressCallback = (event: ProgressEvent) => void;
export type ErrorCallback = (event: ErrorEvent | Error) => void;

export interface PCDHeader {
  data: string;
  headerLen: number;
  fields: string[];
  size: number[];
  type: PCDFieldType[];
  count: number[];
  width: number;
  height: number;
  points: number;
  offset: { [key: string]: number };
  rowSize: number;
  str: string;
}
