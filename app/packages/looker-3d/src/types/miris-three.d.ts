declare module "@miris-inc/three" {
  import { Object3D, Scene as ThreeScene } from "three";

  export class Miris {
    static instance(): Promise<Miris>;
  }

  export class MirisScene extends ThreeScene {
    constructor(init?: { miris?: Miris; viewerKey?: string | null });
    viewerKey: string | null;
    readonly ready: Promise<MirisScene>;
    readonly pending: boolean;
    dispose(): void;
    fetchAssets(tags?: string | string[]): Promise<unknown[]>;
  }

  interface MirisStreamBounds {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
    center: [number, number, number];
  }

  export class MirisStream extends Object3D {
    constructor(init: {
      uuid: string;
      viewerKey?: string;
      authToken?: string;
      drmKey?: string;
    });
    readonly isStream: true;
    static viewerKey: string;
    getBounds(): MirisStreamBounds;
    addEventListener(
      type: "streamloaded" | "rootloaded",
      listener: (event: unknown) => void
    ): void;
    removeEventListener(
      type: "streamloaded" | "rootloaded",
      listener: (event: unknown) => void
    ): void;
  }

  export class MirisControls {
    constructor(
      objects: Object3D | Iterable<Object3D> | null,
      camera: import("three").Camera,
      domElement: HTMLElement
    );
    dispose(): void;
  }
}
