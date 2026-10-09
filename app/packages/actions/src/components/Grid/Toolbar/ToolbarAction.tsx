import { ChevronBottomIcon, type IconProps, TextAction } from "@voxel51/voodo";
import type { ButtonHTMLAttributes, CSSProperties, FC, ReactNode } from "react";

export type ToolbarActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Leading icon, drawn at 12px */
  icon?: FC<IconProps>;
  label?: ReactNode;
  /** Opens a menu, so it carries a trailing chevron */
  menu?: boolean;
  /** On, or its menu is open */
  active?: boolean;
};

const ACTIVE: CSSProperties = {
  background: "var(--color-content-interactive-secondary-hover)",
  color: "var(--color-content-text-primary)",
};

/** The grid toolbar's borderless action: a small icon, a label, a chevron. */
const ToolbarAction = ({
  active,
  icon: Icon,
  label,
  menu,
  style,
  ...props
}: ToolbarActionProps) => (
  <TextAction
    size="md"
    style={{
      height: 28,
      padding: "0 8px",
      gap: 4,
      ...(active ? ACTIVE : {}),
      ...style,
    }}
    {...props}
  >
    {Icon && <Icon size={12} />}
    {label !== undefined && <span>{label}</span>}
    {menu && <ChevronBottomIcon size={12} style={{ opacity: 0.6 }} />}
  </TextAction>
);

export default ToolbarAction;
