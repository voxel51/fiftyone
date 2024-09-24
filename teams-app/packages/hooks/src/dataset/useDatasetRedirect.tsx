import { useCurrentDataset } from '@fiftyone/teams-state';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useDatasetRedirect() {
  const {
    replace,
    route,
    query: { slug: appSlug }
  } = useRouter();
  const dataset = useCurrentDataset(appSlug as string);
  const apiSlug = dataset?.slug;
  useEffect(() => {
    if (appSlug && apiSlug && appSlug !== apiSlug)
      replace(route.replace('[slug]', apiSlug));
  }, [replace, appSlug, apiSlug]);
}
