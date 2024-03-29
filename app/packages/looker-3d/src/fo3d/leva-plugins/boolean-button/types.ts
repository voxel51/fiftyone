import type { LevaInputProps } from "leva/plugin";

export type ButtonProps = {
  label?: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: ({ checked, label }: { checked: boolean; label: string }) => void;
};

type BooleanButtonSettings = {
  checked: boolean;
  onClick: (props: { checked: boolean; label: string }) => void;
  icon: React.ReactNode;
  onCheckboxChange: (v: boolean, label: string) => void;
  buttonStyles?: React.CSSProperties;
};

export type BooleanButtonValue = { checked?: boolean };

export type BooleanButtonInput = BooleanButtonValue &
  Partial<BooleanButtonSettings>;

export type BooleanButtonProps = LevaInputProps<
  BooleanButtonValue,
  BooleanButtonSettings,
  boolean
>;
