import React from "react";
import classnames from "classnames";

import { button } from "./Button.module.css";

const Button: React.FC<
  React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  >
> = ({ children, className, ...rest }) => {
  const classNames = [button, className];
  return (
    <button className={classnames(...classNames)} {...rest}>
      {children}
    </button>
  );
};

export default Button;
