import { DETECTION } from "@fiftyone/utilities";
import { Renderer } from "./Renderer";
import registerRenderer from "./registerRenderer";
import type { Field } from "./types";

interface Label {
  _id: string;
}

export default class Detection extends Renderer<string, Label> {
  get sizeBytes(): number {
    return 1;
  }

  static activator(field: Field) {
    return field.embeddedDocType === DETECTION;
  }

  static use() {
    const color = "black";

    return color;
  }

  draw(ctx, data: Label): void {}

  prepare() {
    return Promise.resolve();
  }
}

registerRenderer(Detection);
