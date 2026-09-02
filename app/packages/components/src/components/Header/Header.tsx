import { animated, useSpring } from "@react-spring/web";
import {
  Align,
  Heading,
  HeadingLevel,
  Orientation,
  Spacing,
  Stack,
} from "@voxel51/voodo";
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
    <Stack
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Lg}
      className={style.header}
    >
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Md}
        className={style.left}
      >
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Md}
          className={style.title}
          data-cy="refresh-fo"
          onClick={() => {
            setToggle(!toggle);
            onRefresh && onRefresh();
          }}
        >
          <animated.img className={style.logo} style={logoProps} src={logo} />
          <Heading level={HeadingLevel.H4} className={style.wordmark}>
            {title}
          </Heading>
        </Stack>
        {navChildren}
      </Stack>
      {children}
    </Stack>
  );
};

export default Header;
