import type { Setter } from '@fiftyone/relay';
import * as fos from '@fiftyone/state';
import { loading } from 'pages/state';
import { useMemo } from 'react';
import { useRecoilCallback } from 'recoil';
import type { Page } from '../loadPageQuery';
import type { DatasetData } from '../transition';
import { pageRunner } from '../usePage';
import { REGISTERED_SETTERS } from './registerSetter';

const useSetters = (dataset: DatasetData) => {
  const handleError = useRecoilCallback(
    ({ set: setRecoil }) =>
      async (errors: string[] = []) => {
        setRecoil(fos.snackbarErrors, errors);
        setRecoil(loading, false);
      },
    []
  );
  const setter = fos.useSessionSetter();

  return useMemo(() => {
    const setters = new Map<string, Setter>();
    const ctx = {
      dataset,
      environment: fos.getCurrentEnvironment(),
      handleError,
      runner: (page: Page) => pageRunner(page),
      setter
    };
    REGISTERED_SETTERS.forEach((value, key) => {
      setters.set(key, value(ctx));
    });

    return setters;
  }, [dataset, setter, handleError]);
};

export default useSetters;
