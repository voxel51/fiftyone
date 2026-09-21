/**
 * Component type button for selecting input types.
 */

import { useTheme } from "@fiftyone/components";
import {
  Clickable,
  Icon,
  IconName,
  Size,
  Text,
  TextVariant,
} from "@voxel51/voodo";
import type { KeyboardEvent } from "react";

interface ComponentTypeButtonProps {
  icon: IconName;
  label: string;
  isSelected: boolean;
  onClick: () => void;
  largeText?: boolean;
  disabled?: boolean;
}

const ComponentTypeButton = ({
  icon,
  label,
  isSelected,
  onClick,
  largeText = false,
  disabled = false,
}: ComponentTypeButtonProps) => {
  const theme = useTheme();

  // Clickable is a plain span: give it the keyboard behavior of a button.
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
      <Clickable
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-pressed={isSelected}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 8,
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            border: isSelected
              ? `1px solid ${theme.voxel[500]}`
              : `1px solid ${theme.primary.softBorder}`,
            backgroundColor: isSelected
              ? `${theme.voxel[500]}1A`
              : "transparent",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <Icon
            name={icon}
            size={Size.Md}
            color={isSelected ? theme.voxel[500] : undefined}
          />
          <Text variant={largeText ? TextVariant.Lg : TextVariant.Md}>
            {label}
          </Text>
        </div>
      </Clickable>
    </div>
  );
};

export default ComponentTypeButton;
