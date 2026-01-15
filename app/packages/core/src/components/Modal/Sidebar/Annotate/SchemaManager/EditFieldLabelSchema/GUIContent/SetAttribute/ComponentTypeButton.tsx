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
import { ComponentButtonContainer } from "../../../styled";

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
    <ComponentButtonContainer $isSelected={isSelected}>
      <Icon
        name={icon}
        size={Size.Md}
        color={isSelected ? "#FF6D04" : undefined}
      />
      <Text variant={TextVariant.Md}>{label}</Text>
    </ComponentButtonContainer>
  </Clickable>
);

export default ComponentTypeButton;
