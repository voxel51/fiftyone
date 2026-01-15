/**
 * Component type button for attribute form.
 */

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
}: ComponentTypeButtonProps) => (
  <Clickable onClick={onClick}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 6,
        border: isSelected
          ? "1px solid var(--fo-palette-primary-main, #FF6D04)"
          : "1px solid var(--fo-palette-divider, #333)",
        backgroundColor: isSelected ? "rgba(255, 109, 4, 0.1)" : "transparent",
        cursor: "pointer",
        minWidth: 100,
      }}
    >
      <Icon
        name={icon}
        size={Size.Md}
        color={isSelected ? "#FF6D04" : undefined}
      />
      <Text variant={TextVariant.Md}>{label}</Text>
    </div>
  </Clickable>
);

export default ComponentTypeButton;
