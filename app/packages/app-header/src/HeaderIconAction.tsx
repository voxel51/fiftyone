/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  Anchor,
  IconAction,
  type IconInput,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

import style from "./HeaderIconAction.module.css";

export type HeaderIconActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconInput;
  /** The accessible name, and the tooltip unless `tooltip` is given */
  label: string;
  tooltip?: string;
  /** On, or its panel is open */
  active?: boolean;
  size?: `${Size.Sm | Size.Md}`;
};

/** An icon-only header action with a tooltip below it. */
export default function HeaderIconAction({
  active,
  className,
  icon,
  label,
  size = Size.Sm,
  tooltip,
  ...props
}: HeaderIconActionProps) {
  return (
    <Tooltip anchor={Anchor.Bottom} content={tooltip ?? label} portal>
      <IconAction
        {...props}
        aria-label={label}
        aria-pressed={active}
        className={clsx(style.action, active && style.active, className)}
        icon={icon}
        size={size}
      />
    </Tooltip>
  );
}
