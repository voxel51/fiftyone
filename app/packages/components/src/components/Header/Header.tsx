import { animated, useSpring } from "@react-spring/web";
import React, { useState } from "react";

import Selector, { SelectorProps } from "../Selector/Selector";

import style from "./Header.module.css";

interface Props extends SelectorProps {
  onRefresh: () => void;
  title: string;
  logo: string;
}

const Header: React.FC<Props> = ({
  children,
  logo,
  title,
  onRefresh,
  ...selector
}) => {
  const [toggle, setToggle] = useState(false);
  const logoProps = useSpring({
    transform: toggle ? `rotate(0turn)` : `rotate(1turn)`,
  });

  return (
    <div className={style.header}>
      <div className={style.left}>
        <div className={style.title} onClick={() => setToggle(!toggle)}>
          <animated.img className={style.logo} style={logoProps} src={logo} />
          <div className={style.fiftyone}>{title}</div>
        </div>
        <div className={style.dataset}>
          <Selector {...selector} />
        </div>
      </div>
      {children}
    </div>
  );
};

export default Header;
