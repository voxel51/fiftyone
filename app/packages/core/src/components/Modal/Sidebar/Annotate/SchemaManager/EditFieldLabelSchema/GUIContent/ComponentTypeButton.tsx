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
}

const ComponentTypeButton = ({
  icon,
  label,
  isSelected,
  onClick,
}: ComponentTypeButtonProps) => {
  const theme = useTheme();

  return (
    <Clickable onClick={onClick}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 6,
          border: isSelected
            ? `1px solid ${theme.voxel[500]}`
            : "1px solid var(--fo-palette-divider, #333)",
          backgroundColor: isSelected ? `${theme.voxel[500]}1A` : "transparent",
          cursor: "pointer",
          minWidth: 80,
        }}
      >
        <Icon
          name={icon}
          size={Size.Md}
          color={isSelected ? theme.voxel[500] : undefined}
        />
        <Text variant={TextVariant.Md}>{label}</Text>
      </div>
    </Clickable>
  );
};

export default ComponentTypeButton;
