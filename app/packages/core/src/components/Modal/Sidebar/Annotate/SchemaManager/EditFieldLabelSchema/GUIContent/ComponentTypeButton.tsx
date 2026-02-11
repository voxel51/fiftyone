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

interface ComponentTypeButtonProps {
  icon: IconName;
  label: string;
  isSelected: boolean;
  onClick: () => void;
  largeText?: boolean;
  "data-cy"?: string;
}

const ComponentTypeButton = ({
  icon,
  label,
  isSelected,
  onClick,
  largeText = false,
  "data-cy": dataCy,
}: ComponentTypeButtonProps) => {
  const theme = useTheme();

  return (
    <div style={{ flex: 1 }} data-cy={dataCy}>
      <Clickable onClick={onClick}>
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
            cursor: "pointer",
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
