import { animated, useSpring } from "@react-spring/web";
import React, { useState } from "react";

import Selector, { SelectorProps } from "../Selector/Selector";

import logo from "../../images/logo.png";

import style from "./Header.module.css";

const Header: React.FC<React.PropsWithChildren<{
  onRefresh?: () => void;
  title: string;
  datasetSelectorProps?: SelectorProps<string>;
}>> = ({ children, title, onRefresh, datasetSelectorProps }) => {
  const [toggle, setToggle] = useState(false);
  const logoProps = useSpring({
    transform: toggle ? `rotate(0turn)` : `rotate(1turn)`,
  });

  return (
    <div className={style.header}>
      <div className={style.left}>
        <div
          className={style.title}
          onClick={() => {
            setToggle(!toggle);
            onRefresh && onRefresh();
          }}
        >
          <animated.img className={style.logo} style={logoProps} src={logo} />
          <div className={style.fiftyone}>{title}</div>
        </div>
        {datasetSelectorProps && (
          <div className={style.dataset}>
            <Selector
              inputStyle={{ height: 40, maxWidth: 300 }}
              containerStyle={{ position: "relative" }}
              inputClassName={style.input}
              overflow={true}
              {...datasetSelectorProps}
            />
          </div>
        )}
      </div>
      {children}
    </div>
  );
};

export default Header;
