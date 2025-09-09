import { ActionItem, ViewButton } from "../containers";

export const SetViewButton = (props: {
  onChangeView: (view: string) => void;
  view: string;
  label: string;
  hint: string;
  dataCy?: string;
}) => {
  const { onChangeView, view, label, hint, dataCy } = props;

  return (
    <ActionItem onClick={() => onChangeView(view)} data-cy={dataCy}>
      <ViewButton title={hint}>{label}</ViewButton>
    </ActionItem>
  );
};
