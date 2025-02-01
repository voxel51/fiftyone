export type BlobDecoder = (url: Blob) => Promise<OverlayMask>;

export const ARRAY_TYPES = {
  Uint8Array,
  Uint8ClampedArray,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
};

export type TypedArray =
  | Uint8Array
  | Uint8ClampedArray
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

export type Decodeables =
  | {
      detections?: InstanceDecodeable[];
    } & InstanceDecodeable;

export interface Decoded {
  bitmap?: ImageBitmap;
}

export type InlineDecodeable =
  | {
      $binary?: { base64: string };
    }
  | string;

interface InstanceDecodeable {
  map?: Decoded & InlineDecodeable & IntermediateMask;
  map_path?: string;
  mask?: Decoded & InlineDecodeable & IntermediateMask;
  mask_path?: string;
}

export interface IntermediateMask {
  data: OverlayMask;
  image: ArrayBuffer;
}

export interface OverlayMask {
  buffer: ArrayBuffer;
  shape: [number, number];
  channels: number;
  arrayType: keyof typeof ARRAY_TYPES;
}
