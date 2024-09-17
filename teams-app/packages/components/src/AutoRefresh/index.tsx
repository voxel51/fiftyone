import {
  FormControlLabel,
  FormControlLabelProps,
  Switch,
  SwitchProps
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useAutoRefresh } from '@fiftyone/hooks';
import { useBrowserStorage } from '@fiftyone/state';

export default function AutoRefresh(props: AutoRefreshPropsType) {
  const {
    defaultInactive,
    paused,
    refresh,
    switchProps,
    interval,
    persistanceKey,
    ...otherProps
  } = props;
  const useStateHook =
    typeof persistanceKey === 'string' ? useBrowserStorage : useState;
  const stateHookArgs = persistanceKey
    ? [persistanceKey, !defaultInactive]
    : [!defaultInactive];
  const [checked, setChecked] = useStateHook<boolean>(...stateHookArgs);
  const [start, stop] = useAutoRefresh(refresh, interval);

  useEffect(() => {
    if (checked && !paused) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [checked, paused, start, stop]);

  return (
    <FormControlLabel
      control={
        <Switch
          defaultChecked={!defaultInactive}
          onChange={(e) => setChecked(e.target.checked)}
          size="small"
          sx={{ mr: 0.5 }}
          checked={checked}
          {...switchProps}
        />
      }
      label="Auto refresh"
      {...otherProps}
    />
  );
}

type AutoRefreshPropsType = Omit<FormControlLabelProps, 'label' | 'control'> & {
  control?: FormControlLabelProps['control'];
  defaultInactive?: boolean;
  interval?: number;
  label?: FormControlLabelProps['label'];
  paused?: boolean;
  refresh: () => void;
  switchProps?: SwitchProps;
  persistanceKey?: string;
};
