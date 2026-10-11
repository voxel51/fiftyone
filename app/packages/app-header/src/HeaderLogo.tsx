/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import clsx from "clsx";
import React, { useState } from "react";

import style from "./HeaderLogo.module.css";

export interface HeaderLogoProps {
  src: string;
  /** What activating the logo does, as its accessible name and title. */
  label?: string;
  /** Renders a link, for a logo that leads somewhere. */
  href?: string;
  /** Runs on activation; a link's plain clicks are left to it to handle. */
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  "data-cy"?: string;
}

/**
 * The header's mark: a round target that spins a turn each time it is
 * activated, or a plain mark when it does nothing.
 */
export default function HeaderLogo({
  href,
  label,
  onClick,
  src,
  "data-cy": dataCy,
}: HeaderLogoProps) {
  // The class toggles between two rotations a full turn apart, and the
  // transition carries the logo there
  const [turned, setTurned] = useState(false);
  const mark = (
    <img
      className={clsx(style.logo, turned && style.turned)}
      src={src}
      alt=""
    />
  );
  const activate = (event: React.MouseEvent<HTMLElement>) => {
    setTurned((on) => !on);
    onClick?.(event);
  };

  if (href) {
    return (
      <a
        className={clsx(style.home, style.interactive)}
        href={href}
        onClick={activate}
        title={label}
        aria-label={label}
        data-cy={dataCy}
      >
        {mark}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={clsx(style.home, style.interactive)}
        onClick={activate}
        title={label}
        aria-label={label}
        data-cy={dataCy}
      >
        {mark}
      </button>
    );
  }

  return (
    <span className={style.home} data-cy={dataCy}>
      {mark}
    </span>
  );
}
