import { formatListWithCount } from '@fiftyone/teams-utilities';
import { Stack, Typography } from '@mui/material';

export default function SnapshotChanges(props: SnapshotChangesProps) {
  const { items } = props;
  const formattedDelete = formatChange(items.delete);
  const formattedAdd = formatChange(items.add);
  const formattedUpdate = formatChange(items.update);
  const noChanges =
    !isNonEmptyArray(formattedAdd) &&
    !isNonEmptyArray(formattedUpdate) &&
    !isNonEmptyArray(formattedDelete);

  return (
    <Stack
      direction="row"
      spacing={1}
      divider={<Typography>&middot;</Typography>}
    >
      {noChanges && (
        <Typography color="text.tertiary">No new changes</Typography>
      )}
      {isNonEmptyArray(formattedAdd) && (
        <Typography sx={{ color: (theme) => theme.palette.success.main }}>
          {formatListWithCount(formattedAdd)} added
        </Typography>
      )}
      {isNonEmptyArray(formattedUpdate) && (
        <Typography sx={{ color: (theme) => theme.palette.warning.main }}>
          {formatListWithCount(formattedUpdate)} updated
        </Typography>
      )}
      {isNonEmptyArray(formattedDelete) && (
        <Typography color="error">
          {formatListWithCount(formattedDelete)} deleted
        </Typography>
      )}
    </Stack>
  );
}
export type SnapshotChangesItem = {
  type: 'sample' | 'tag';
  count: number;
};

export type SnapshotChangesProps = {
  items: {
    add: Array<SnapshotChangesItem>;
    delete: Array<SnapshotChangesItem>;
    update: Array<SnapshotChangesItem>;
  };
};

function formatChange(changesItem: Array<SnapshotChangesItem>) {
  if (!Array.isArray(changesItem)) return [];
  return changesItem
    .map(({ type, count }) => ({ label: type, amount: count }))
    .filter(({ amount }) => amount > 0);
}

function isNonEmptyArray(value: Array<unknown>) {
  return Array.isArray(value) && value.length > 0;
}
