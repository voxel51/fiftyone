import { ReactNode } from "react";

export interface AnnotationAction {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tooltip?: string;
  isActive?: boolean;
  isDisabled?: boolean;
  isVisible?: boolean;
  onClick: () => void;
  customComponent?: ReactNode;
}

export interface AnnotationActionGroup {
  id: string;
  label?: string;
  isHidden?: boolean;
  actions: AnnotationAction[];
}

export interface AnnotationToolbarProps {
  isVisible: boolean;
  actions: AnnotationActionGroup[];
  className?: string;
}
