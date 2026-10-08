import React from "react";
import classnames from "classnames";

import styles from "./Button.module.css";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
const Button: React.FC<
  React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  >
> = ({ children, className, ...rest }) => {
  const classNames = [styles.button, className];
  return (
    <button className={classnames(...classNames)} {...rest}>
      {children}
    </button>
  );
};

export default Button;
