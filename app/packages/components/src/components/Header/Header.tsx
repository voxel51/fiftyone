import {
  Align,
  Heading,
  HeadingLevel,
  Orientation,
  Spacing,
  Stack,
} from "@voxel51/voodo";
import clsx from "clsx";
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
  // Each refresh spins the logo one full turn: the class toggles between two
  // rotations a full turn apart, and the transition carries it there
  const [turned, setTurned] = useState(false);

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
            setTurned(!turned);
            onRefresh && onRefresh();
          }}
        >
          <img
            className={clsx(style.logo, turned && style.turned)}
            src={logo}
            alt=""
          />
          <Heading level={HeadingLevel.H1} className={style.wordmark}>
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
