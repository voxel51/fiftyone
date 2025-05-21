import type { Data, Field } from "./types";

export abstract class Renderer<C, D = Data> extends EventTarget {
  abstract get sizeBytes(): number;

  activator = (field: Field) => false;
  static use(): C {
    return {};
  }

  draw(ctx: C, data: D) {}
  prepare(ctx: C, data: D) {
    return Promise.resolve();
  }
}
