import { animated, useSpring } from "@react-spring/web";
import React, { useState } from "react";

import { header } from "./Header.module.css";

interface Props {
  onRefresh: () => void;
  title: string;
  logo: string;
}

const Header: React.FC<Props> = ({ children, logo, title }) => {
  const [toggle, setToggle] = useState(false);
  const logoProps = useSpring({
    transform: toggle ? `rotate(0turn)` : `rotate(1turn)`,
  });

  return (
    <div className={header}>
      <div onClick={() => setToggle(!toggle)}>
        <animated.img style={logoProps} src={logo} />
        <div>{title}</div>
      </div>
      {children}
    </div>
  );
};

export default Header;
