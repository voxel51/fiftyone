import { Selection } from "@fiftyone/teams-components";

interface IProp {
  type: string;
  setType: (type: string) => void;
  options: {
    id: string;
    label: string;
  }[];
}
export default function ViewOrDatasetSelection(props: IProp) {
  return (
    <Selection
      label="View"
      items={props.options}
      value={props.type}
      selectProps={{
        fullWidth: true,
      }}
      containerProps={{ sx: { mt: 1 } }}
      onChange={(selectedType) => {
        props.setType(selectedType);
      }}
    />
  );
}
