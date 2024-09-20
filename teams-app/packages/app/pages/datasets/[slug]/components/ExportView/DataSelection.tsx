import { useEnv, useExportView } from '@fiftyone/hooks';
import { Selection } from '@fiftyone/teams-components';
import { CONSTANT_VARIABLES } from '@fiftyone/teams-state';
const { EXPORT_DATA_ITEMS, ALLOW_MEDIA_EXPORT_ENV_KEY } = CONSTANT_VARIABLES;

export default function DataSelection() {
  const { data, setData } = useExportView();
  const allowMediaExport = useEnv(ALLOW_MEDIA_EXPORT_ENV_KEY);

  const items = Object.values(EXPORT_DATA_ITEMS);
  const filteredItems =
    allowMediaExport === 'false'
      ? items.filter(({ label }) => !label.includes('Media'))
      : items;

  return (
    <Selection
      label="Data"
      items={filteredItems}
      value={data}
      selectProps={{
        fullWidth: true
      }}
      containerProps={{ sx: { mt: 1 } }}
      onChange={(selectedType) => {
        setData(selectedType);
      }}
    />
  );
}
