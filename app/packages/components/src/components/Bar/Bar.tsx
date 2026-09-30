import styles from "./Bar.module.css";

import React from "react";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
const Bar = React.forwardRef<
  HTMLDivElement,
  Omit<React.HTMLProps<HTMLDivElement>, "className">
>(({ children, ...props }, ref) => {
  return (
    <div ref={ref} className={styles.bar} {...props}>
      {children}
    </div>
  );
});

export default Bar;
