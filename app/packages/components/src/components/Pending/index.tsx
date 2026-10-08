import { BrandColor, getColorCssVar } from "@voxel51/voodo";
import type { CSSProperties } from "react";
import style from "./index.module.css";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
const Pending = () => {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className={style.pending}
      style={
        {
          "--pending-color": getColorCssVar(BrandColor.Primary),
        } as CSSProperties
      }
    >
      <div className={style.sweep} />
    </div>
  );
};

export default Pending;
