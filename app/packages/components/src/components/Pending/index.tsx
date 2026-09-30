import { BackgroundColor, Progress, Size } from "@voxel51/voodo";
import style from "./index.module.css";

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
