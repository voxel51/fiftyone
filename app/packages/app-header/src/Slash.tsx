/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import clsx from "clsx";

import style from "./Slash.module.css";

/** The breadcrumb's divider: a thin slanted stroke */
export default function Slash({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 24"
      aria-hidden
      className={clsx(style.slash, className)}
    >
      <path
        d="M8.5 3 3.5 21"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
