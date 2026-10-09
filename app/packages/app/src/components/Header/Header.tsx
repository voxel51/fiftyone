import {
  Align,
  Heading,
  HeadingLevel,
  Minimize2Icon,
  Orientation,
  Size,
  Spacing,
  Stack,
  TextAction,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { useState } from "react";

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
    /** Makes the logo a refresh button, spinning a turn on each click. */
    onRefresh?: () => void;
    /** The breadcrumb after the logo, each part behind a slash. */
    crumbs?: React.ReactNode[];
    /** Spans the window under the first row, for a surface that needs it. */
    belowRow?: React.ReactNode;
    /** Out of sight and out of reach, still mounted. */
    hidden?: boolean;
    /** Focus mode: the first row folds away, with a way back at the top. */
    onExitFocus?: () => void;
  }>
> = ({
  belowRow,
  children,
  crumbs = [],
  hidden,
  onExitFocus,
  title,
  onRefresh,
}) => {
  // The class toggles between two rotations a full turn apart, and the
  // transition carries the logo there
  const [turned, setTurned] = useState(false);
  const mark = (
    <img
      className={clsx(style.logo, turned && style.turned)}
      src={logo}
      alt=""
    />
  );

  return (
    <div
      className={clsx(
        style.header,
        hidden && style.hidden,
        onExitFocus && style.focused,
      )}
    >
      {onExitFocus && (
        <div className={style.restore}>
          <TextAction
            size={Size.Sm}
            leadingIcon={Minimize2Icon}
            onClick={onExitFocus}
            data-cy="header-exit-focus"
          >
            Exit focus mode
          </TextAction>
        </div>
      )}
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
          {onRefresh ? (
            <button
              type="button"
              className={style.home}
              onClick={() => {
                setTurned(!turned);
                onRefresh();
              }}
              title="Refresh"
              aria-label="Refresh"
              data-cy="refresh-fo"
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
