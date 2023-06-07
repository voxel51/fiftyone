import { animated, useSpring } from "@react-spring/web";
import React, { useState } from "react";

import logo from "../../images/logo.png";

import style from "./Header.module.css";

const Header: React.FC<
  React.PropsWithChildren<{
    onRefresh?: () => void;
    title: string;
    navChildren?: React.ReactNode;
  }>
> = ({ children, title, navChildren, onRefresh }) => {
  const [toggle, setToggle] = useState(false);
  const logoProps = useSpring({
    transform: toggle ? `rotate(0turn)` : `rotate(1turn)`,
  });

  return (
    <div className={style.header}>
      <div className={style.left}>
        {navChildren}
      </div>
      {children}
    </div>
  );
};

export default Header;
