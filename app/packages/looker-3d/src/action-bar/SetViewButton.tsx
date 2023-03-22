import { ActionItem, ViewButton } from "../containers";

export const SetViewButton = (props: {
  onChangeView: (view: string) => void;
  view: string;
  label: string;
  hint: string;
}) => {
  const { onChangeView, view, label, hint } = props;

  return (
    <ActionItem onClick={() => onChangeView(view)}>
      <ViewButton title={hint}>{label}</ViewButton>
    </ActionItem>
  );
};
