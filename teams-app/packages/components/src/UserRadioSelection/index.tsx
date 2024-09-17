import { useCurrentUser } from '@fiftyone/hooks';
import useDatasetsFilter from '@fiftyone/hooks/src/datasets/DatasetList/useFilters';
import { RadioGroup } from '@fiftyone/teams-components';

export default function UserRadioSelection() {
  const [{ id }] = useCurrentUser();
  const { createdByUser, setCreatedByUser } = useDatasetsFilter();

  // try.fiftyone or public host does not have a user concept
  if (!id) {
    return null;
  }

  return (
    <RadioGroup
      sx={{ pl: '0.5rem', pr: '0.5rem' }}
      value={createdByUser}
      items={[
        { value: 'all', label: 'All' },
        { value: 'mine', label: 'Mine' }
      ]}
      onChange={(_, value) => {
        setCreatedByUser(value);
      }}
      row
    />
  );
}
