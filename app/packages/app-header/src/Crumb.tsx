/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import clsx from "clsx";
import React, { forwardRef } from "react";

import style from "./Crumb.module.css";

export type CrumbProps = Omit<React.HTMLAttributes<HTMLElement>, "title"> & {
  /** Leads the label; a 14px icon. */
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** The label reads as a placeholder. */
  muted?: boolean;
  /** After the label: a count, a caret, a pin. */
  trailing?: React.ReactNode;
  /** Filled, as while its menu is open. */
  open?: boolean;
  /** Renders a link. */
  href?: string;
  labelCy?: string;
};

/**
 * One part of the header's breadcrumb: a pill that fills on hover when it
 * leads somewhere or opens something, and reads as plain text otherwise.
 */
const Crumb = forwardRef<HTMLElement, CrumbProps>(function Crumb(
  { className, href, icon, label, labelCy, muted, open, trailing, ...props },
  ref,
) {
  const content = (
    <>
      {icon}
      <Text
        variant={TextVariant.HeadingSm}
        color={muted ? TextColor.Secondary : TextColor.Primary}
        className={style.label}
        data-cy={labelCy}
      >
        {label}
      </Text>
      {trailing}
    </>
  );
  const classes = (interactive: boolean) =>
    clsx(
      style.crumb,
      interactive && style.interactive,
      open && style.open,
      className,
    );

  if (href) {
    return (
      <a
        {...props}
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={classes(true)}
      >
        {content}
      </a>
    );
  }

  if (props.onClick) {
    return (
      <button
        {...props}
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        className={classes(true)}
      >
        {content}
      </button>
    );
  }

  return (
    <span {...props} ref={ref} className={classes(false)}>
      {content}
    </span>
  );
});

export default Crumb;
