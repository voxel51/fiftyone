import styles from "./Bar.module.css";

import React from "react";

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
