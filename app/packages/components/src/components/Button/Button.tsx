import React from "react";
import classnames from "classnames";

import styles from "./Button.module.css";

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
