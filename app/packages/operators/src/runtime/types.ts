export type SubmitOption = {
  label: string;
  id: string;
  default: boolean;
  description: string;
  onSelect: () => void;
  onClick: () => void;
};
