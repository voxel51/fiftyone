import * as fos from '@fiftyone/state';
import { Selection, TextInputCopy } from '@fiftyone/teams-components';
import { toSlug } from '@fiftyone/utilities';
import { Box, Link, Typography } from '@mui/material';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import type { SetterOrUpdater } from 'recoil';
import { useRecoilValue } from 'recoil';

const MAX_URL_LENGTH = 2000;

const getURL = (url: URL, share: object) => {
  const filtered = {};

  for (const [key, value] of Object.entries(share)) {
    if (!value) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === 'object' && !Object.keys(value).length) continue;
    filtered[key] = value;
  }

  Object.keys(filtered).length &&
    url.searchParams.set('share', encodeURIComponent(JSON.stringify(filtered)));
  const urlString = url.toString();
  return urlString.length > MAX_URL_LENGTH ? undefined : urlString;
};

const useItems = (onSamplesPage: boolean, snapshot: string | null) => {
  const {
    fieldVisibilityStage,
    filters,
    hasFilters,
    hasModalFilters,
    modalFilters,
    modalSelector,
    view,
    viewName
  } = useDatasetState(onSamplesPage);

  const items = useMemo(() => {
    const url = new URL(window.location.toString());

    if (snapshot && onSamplesPage) {
      url.searchParams.set('snapshot', toSlug(snapshot));
    }

    if (viewName && onSamplesPage) {
      url.searchParams.set('view', toSlug(viewName));
    }

    if (modalSelector && onSamplesPage) {
      const items = [
        {
          id: 'dataset',
          label: 'Sample',
          url: getURL(url, {
            fieldVisibilityStage,
            filters,
            view: viewName ? [] : view
          })
        }
      ];

      if (hasModalFilters) {
        items.push({
          id: 'filters',
          label: 'Sample with sidebar filters',
          url: getURL(url, {
            fieldVisibilityStage,
            filters,
            modalFilters,
            view: viewName ? [] : view
          })
        });
      }

      return items;
    }

    const items = [
      viewName && onSamplesPage
        ? {
            id: 'dataset',
            label: 'Saved view',
            url: getURL(url, { fieldVisibilityStage })
          }
        : {
            id: 'dataset',
            label: 'Dataset',
            url: getURL(url, { fieldVisibilityStage })
          }
    ];

    if (!onSamplesPage) {
      return items;
    }

    if (!view.length && !viewName) {
      if (hasFilters) {
        items.push({
          id: 'sidebar',
          label: 'Dataset with sidebar filters',
          url: getURL(url, { fieldVisibilityStage, filters })
        });
      }

      return items;
    }

    !viewName &&
      items.push({
        id: 'view',
        label: 'View',
        url: getURL(url, { fieldVisibilityStage, view })
      });

    if (hasFilters) {
      items.push({
        id: 'view-sidebar',
        label: `${viewName ? 'Saved view' : 'view'} with sidebar filters`,
        url: getURL(url, {
          fieldVisibilityStage,
          filters,
          view
        })
      });
    }

    return items;
  }, [
    fieldVisibilityStage,
    filters,
    hasFilters,
    hasModalFilters,
    modalFilters,
    modalSelector,
    onSamplesPage,
    snapshot,
    view,
    viewName
  ]);

  const itemMap = useMemo(() => {
    return Object.fromEntries(items.map((item) => [item.id, item]));
  }, [items]);

  return { items, itemMap };
};

const useDatasetContext = () => {
  // todo: improve this
  const onSamplesPage = window.location.pathname.endsWith('/samples');
  return {
    onSamplesPage,
    snapshot: onSamplesPage ? useRecoilValue(fos.datasetSnapshotName) : null
  };
};

const useDatasetState = (onSamplesPage: boolean) => {
  if (!onSamplesPage) {
    return {};
  }

  const fieldVisibilityStage = useRecoilValue(fos.fieldVisibilityStage);
  const filters = useRecoilValue(fos.filters);
  const hasFilters = useRecoilValue(fos.hasFilters(false));
  const hasModalFilters = useRecoilValue(fos.hasFilters(true));
  const modalFilters = useRecoilValue(fos.modalFilters);
  const modalSelector = useRecoilValue(fos.modalSelector);
  const view = useRecoilValue(fos.view);
  const viewName = useRecoilValue(fos.viewName);

  return {
    fieldVisibilityStage,
    filters,
    hasFilters,
    hasModalFilters,
    modalFilters,
    modalSelector,
    view,
    viewName
  };
};

function InputDatasetURL({ setOpen }: { setOpen: SetterOrUpdater<boolean> }) {
  const { onSamplesPage, snapshot } = useDatasetContext();
  const { items, itemMap } = useItems(onSamplesPage, snapshot);
  const router = useRouter();
  const { slug } = router.query;
  const [selection, setSelection] = useState('dataset');

  useEffect(() => {
    items;
    return () => {
      onSamplesPage && setOpen(false);
    };
  }, [items, onSamplesPage, setOpen]);

  return (
    <Box display="flex" flexDirection="column" width="100%">
      <Box display="flex" width="100%">
        {items.length > 1 && (
          <Selection
            items={items}
            value={selection}
            onChange={(selection) => {
              if (Array.isArray(selection)) {
                throw new Error('unexpected');
              }
              setSelection(selection);
            }}
            menuSize="auto"
          />
        )}
        <TextInputCopy
          variant="outlined"
          fieldLabel=""
          value={itemMap[selection].url}
          fullWidth
        />
      </Box>
      <Typography variant="body1" pt={1}>
        Only people with access will be able to use this link.
      </Typography>
      {!snapshot && (
        <Typography variant="body2" pt={1}>
          <NextLink
            href={`/datasets/${encodeURIComponent(slug.toString())}/history`}
            passHref
          >
            <Link> Create a snapshot</Link>
          </NextLink>{' '}
          to share a permalink
        </Typography>
      )}
    </Box>
  );
}

export default InputDatasetURL;
