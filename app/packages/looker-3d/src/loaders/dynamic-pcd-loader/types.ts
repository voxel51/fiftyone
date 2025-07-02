export type PCDFileFormat = "F" | "I" | "U";

export type AttributeName = string;

export const PCDFileFormat = {
  Ascii: "ascii" as const,
  Binary: "binary" as const,
  BinaryCompressed: "binary_compressed" as const,
};

export type DynamicPCDBufferGeometryUserData = Record<
  AttributeName,
  {
    min: number;
    max: number;
  }
>;

export type PCDAttributes = Record<
  string,
  | Float32Array
  | Int32Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Uint8Array
  | Uint16Array
>;

export type PCDFileType = typeof PCDFileFormat[keyof typeof PCDFileFormat];

export type ProgressCallback = (event: ProgressEvent) => void;
export type ErrorCallback = (event: ErrorEvent | Error) => void;

export interface PCDHeader {
  data: string;
  headerLen: number;
  fields: string[];
  size: number[];
  type: PCDFileFormat[];
  count: number[];
  width: number;
  height: number;
  points: number;
  offset: { [key: string]: number };
  rowSize: number;
  str: string;
}
