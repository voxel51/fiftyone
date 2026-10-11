/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  Align,
  Heading,
  HeadingLevel,
  Maximize2Icon,
  Minimize2Icon,
  Orientation,
  Size,
  Spacing,
  Stack,
  TextAction,
} from "@voxel51/voodo";
import clsx from "clsx";
import React from "react";

import style from "./AppHeader.module.css";
import HeaderIconAction from "./HeaderIconAction";
import Slash from "./Slash";

export interface HeaderFocus {
  focused: boolean;
  toggle: () => void;
  exit: () => void;
}

export interface AppHeaderProps {
  /** The mark at the start of the row, usually a {@link HeaderLogo}. */
  logo?: React.ReactNode;
  /** The wordmark beside the logo, for pages without a breadcrumb. */
  title?: string;
  /** The breadcrumb after the logo, each part behind a slash. */
  crumbs?: React.ReactNode[];
  /** After the breadcrumb: a page's tabs or status. */
  center?: React.ReactNode;
  /** The start of the right side: the page's own actions. */
  actions?: React.ReactNode;
  /** After the focus action: theme, help and the like. */
  utilities?: React.ReactNode;
  /** The end of the right side. */
  account?: React.ReactNode;
  /** Spans the window under the row, and stays in focus mode. */
  banner?: React.ReactNode;
  /** Spans the window under the banner; tightens in focus mode. */
  belowRow?: React.ReactNode;
  /** Out of sight and out of reach, still mounted. */
  hidden?: boolean;
  /** Offers focus mode, where the row folds away with a way back at the top. */
  focus?: HeaderFocus;
}

/**
 * The App's header: the logo, the breadcrumb and a center slot on the left,
 * the actions on the right, and full-width rows beneath. Products fill the
 * slots; the header owns the chrome, the order and focus mode.
 */
export default function AppHeader({
  account,
  actions,
  banner,
  belowRow,
  center,
  crumbs = [],
  focus,
  hidden,
  logo,
  title,
  utilities,
}: AppHeaderProps) {
  const focused = Boolean(focus?.focused);

  return (
    <div
      className={clsx(
        style.header,
        hidden && style.hidden,
        focused && style.focused,
      )}
      data-cy="app-header"
    >
      {focus && focused && (
        <div className={style.restore}>
          <TextAction
            size={Size.Sm}
            leadingIcon={Minimize2Icon}
            onClick={focus.exit}
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
          {logo}
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
        {center && <div className={style.center}>{center}</div>}
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
          className={style.actions}
        >
          {actions}
          {/* Remounted as the row hides, so its tooltip does not stay open
              over whatever covers the row */}
          {focus && (
            <React.Fragment key={hidden || focused ? "hidden" : "shown"}>
              <HeaderIconAction
                icon={Maximize2Icon}
                label="Focus mode"
                tooltip="Focus mode (F)"
                size={Size.Md}
                onClick={focus.toggle}
                data-cy="header-focus"
              />
            </React.Fragment>
          )}
          {utilities}
          {account}
        </Stack>
      </Stack>
      {banner && <div className={style.banner}>{banner}</div>}
      {belowRow && <div className={style.belowRow}>{belowRow}</div>}
    </div>
  );
}
