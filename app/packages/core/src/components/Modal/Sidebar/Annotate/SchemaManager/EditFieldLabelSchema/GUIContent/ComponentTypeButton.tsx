/**
 * Component type button for selecting input types.
 */

import { useTheme } from "@fiftyone/components";
import { Clickable, Size, Text, TextVariant } from "@voxel51/voodo";
import type { IconProps } from "@voxel51/voodo";
import type { FC } from "react";

interface ComponentTypeButtonProps {
  icon: FC<IconProps>;
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
  const IconComponent = icon;

  return (
    <div style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
      <Clickable onClick={disabled ? undefined : onClick}>
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
          <IconComponent
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
