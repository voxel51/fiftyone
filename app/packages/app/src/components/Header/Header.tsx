import {
  Align,
  Heading,
  HeadingLevel,
  Orientation,
  Spacing,
  Stack,
} from "@voxel51/voodo";
import clsx from "clsx";
import React from "react";

import logo from "../../images/logo.png";

import style from "./Header.module.css";

const Header: React.FC<
  React.PropsWithChildren<{
    /** The wordmark beside the logo, for pages without a breadcrumb. */
    title?: string;
    /** Makes the logo the way back to all datasets. */
    onHome?: () => void;
    navChildren?: React.ReactNode;
    /** Spans the window under the first row, for a surface that needs it. */
    belowRow?: React.ReactNode;
    /** Out of sight and out of reach, still mounted. */
    hidden?: boolean;
  }>
> = ({ belowRow, children, hidden, title, navChildren, onHome }) => {
  const mark = <img className={style.logo} src={logo} alt="" />;

  return (
    <div className={clsx(style.header, hidden && style.hidden)}>
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Md}
        className={style.row}
      >
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
          className={style.left}
        >
          {onHome ? (
            <button
              type="button"
              className={style.home}
              onClick={onHome}
              title="All datasets"
              aria-label="All datasets"
              data-cy="header-home"
            >
              {mark}
            </button>
          ) : (
            <span className={style.home}>{mark}</span>
          )}
          {title && (
            <Heading level={HeadingLevel.H1} className={style.wordmark}>
              {title}
            </Heading>
          )}
          {navChildren}
        </Stack>
        {children}
      </Stack>
      {belowRow && <div className={style.belowRow}>{belowRow}</div>}
    </div>
  );
};

export default Header;
