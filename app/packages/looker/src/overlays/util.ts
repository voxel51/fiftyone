/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, Coordinates } from "../state";
import { BaseLabel } from "./base";

export const t = (state: BaseState, x: number, y: number): Coordinates => {
  const [ctlx, ctly, cw, ch] = state.canvasBBox;
  return [ctlx + cw * x, ctly + ch * y];
};

export const sizeBytes = (label: BaseLabel) => {
  let bytes = 0;
  const sizer = (obj: any) => {
    if (obj instanceof ArrayBuffer) {
      bytes += obj.byteLength;
    } else if (obj !== null && obj !== undefined) {
      switch (typeof obj) {
        case "number":
          bytes += 8;
          break;
        case "string":
          bytes += obj.length * 2;
          break;
        case "boolean":
          bytes += 4;
          break;
        case "object":
          var objClass = Object.prototype.toString.call(obj).slice(8, -1);
          if (objClass === "Object" || objClass === "Array") {
            for (var key in obj) {
              if (!obj.hasOwnProperty(key)) continue;
              sizer(obj[key]);
            }
          } else bytes += obj.toString().length * 2;
          break;
      }
    }
  };

  sizer(label);

  return bytes;
};
