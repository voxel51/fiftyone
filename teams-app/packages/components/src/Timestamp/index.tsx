import {
  dateTime,
  longDate,
  shortDate,
  timeFromNow
} from '@fiftyone/teams-utilities';
import { Typography, TypographyProps } from '@mui/material';

export default function Timestamp(props: TimestampPropsType) {
  const { timestamp, format = 'elapsed', withoutSuffix, ...otherProps } = props;

  const title = dateTime(timestamp, { includeUTC: true });
  const formattedTimestamp = formatters[format](timestamp, withoutSuffix);

  return (
    <Typography title={title} component="span" {...otherProps}>
      {formattedTimestamp}
    </Typography>
  );
}

type TimestampPropsType = TypographyProps & {
  timestamp: Date | number | string;
  format?: 'elapsed' | 'long' | 'short';
  withoutSuffix?: boolean;
};

const formatters = {
  elapsed: timeFromNow,
  long: longDate,
  short: shortDate
};
