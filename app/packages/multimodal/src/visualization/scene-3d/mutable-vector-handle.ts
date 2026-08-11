export interface MutableVectorHandle {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  set: (x: number, y: number, z: number) => unknown;
}
