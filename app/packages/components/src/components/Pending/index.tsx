import { BackgroundColor, Progress, Size } from "@voxel51/voodo";
import style from "./index.module.css";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
const Pending = () => {
  return (
    <div className={style.pending}>
      <Progress
        aria-label="Loading"
        size={Size.Sm}
        trackColor={BackgroundColor.Transparent}
      />
    </div>
  );
};

export default Pending;
