/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { IconAction, type IconInput, Size, Tooltip } from "@voxel51/voodo";
import type { ButtonHTMLAttributes } from "react";
import styles from "../ViewerHeader.module.css";

export type HeaderActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconInput;
  /** The accessible name, and the tooltip unless `tooltip` is given */
  label: string;
  tooltip?: string;
  /** On, or its panel is open */
  active?: boolean;
};

/** An icon-only header action with a tooltip below it. */
const HeaderAction = ({
  active,
  className,
  icon,
  label,
  tooltip,
  ...props
}: HeaderActionProps) => (
  <Tooltip anchor="bottom" content={tooltip ?? label} portal>
    <IconAction
      {...props}
      aria-label={label}
      aria-pressed={active}
      className={[active ? styles.active : undefined, className]
        .filter(Boolean)
        .join(" ")}
      icon={icon}
      size={Size.Sm}
    />
  </Tooltip>
);

export default HeaderAction;
