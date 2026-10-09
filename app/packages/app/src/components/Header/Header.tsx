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

/** The breadcrumb's divider: a thin slanted stroke */
const Slash = () => (
  <svg viewBox="0 0 12 24" aria-hidden className={style.slash}>
    <path
      d="M8.5 3 3.5 21"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const Header: React.FC<
  React.PropsWithChildren<{
    /** The wordmark beside the logo, for pages without a breadcrumb. */
    title?: string;
    /** Makes the logo the way back to all datasets. */
    onHome?: () => void;
    /** The breadcrumb after the logo, each part behind a slash. */
    crumbs?: React.ReactNode[];
    /** Spans the window under the first row, for a surface that needs it. */
    belowRow?: React.ReactNode;
    /** Out of sight and out of reach, still mounted. */
    hidden?: boolean;
  }>
> = ({ belowRow, children, crumbs = [], hidden, title, onHome }) => {
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
          spacing={Spacing.None}
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
            <Heading
              level={HeadingLevel.H1}
              className={clsx(
                style.wordmark,
                crumbs.length > 0 && style.beforeSlash,
              )}
            >
              {title}
            </Heading>
          )}
          {crumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              <Slash />
              {crumb}
            </React.Fragment>
          ))}
        </Stack>
        {children}
      </Stack>
      {belowRow && <div className={style.belowRow}>{belowRow}</div>}
    </div>
  );
};

export default Header;
