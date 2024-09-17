import { formatNumber } from '@fiftyone/teams-utilities';
import { Typography } from '@mui/material';

export default function SamplesTotal({ count }: { count: number }) {
  return <Typography>{formatNumber(count, '0,0')} samples total</Typography>;
}
