import useDatasetsFilter from "@fiftyone/hooks/src/datasets/DatasetList/useFilters";
import { Selection } from "@fiftyone/teams-components";
import { mediaTypeItems } from "@fiftyone/teams-state/src/constants";

export default function MediaTypeSelection() {
  const { mediaTypes, setMediaTypes } = useDatasetsFilter();

  return (
    <Selection
      items={mediaTypeItems.map(({ id, label }) => ({
        id,
        label,
      }))}
      hidePlaceholder
      menuSize="small"
      placeholder=""
      onChange={(items) => {
        setMediaTypes(items as string[]);
      }}
      selectProps={{
        sx: { mr: 1, ml: 1, color: (theme) => theme.palette.text.secondary },
        multiple: true,
        inputProps: { sx: { maxWidth: 100 } },
      }}
      labelPrefix="Media types "
      value={mediaTypes}
    />
  );
}
