import React, { useCallback, useMemo } from 'react';
import { Selection } from '@fiftyone/teams-components';
import useUsersSearch from '@fiftyone/hooks/src/settings/useUsersSearch'

import { SORT_OPTIONS, sortOptionType } from './constants';


export default function UserSort() {
  const { field, direction, setSort } = useUsersSearch();
  const handleSortClick = useCallback((sortOption: sortOptionType) => {
    setSort(sortOption);
  }, []);

  const sortOptions = useMemo(() => {
    return SORT_OPTIONS.reduce((items, { field, direction, displayName }) => {
      const id = field + direction;
      items[id] = {
        id,
        label: displayName,
        field,
        direction,
        displayName
      };
      return items;
    }, {});
  }, []);

  return (
    <Selection
      items={Object.values(sortOptions)}
      menuSize="small"
      value={field + direction}
      noBorder
      selectProps={{
        renderValue(id: string) {
          const { displayName } = sortOptions[id];
          return `Sort by: ${displayName}`;
        },
        sx: {
          minWidth: 150,
          color: (theme) => theme.palette.text.secondary
        },
        MenuProps: {
          anchorOrigin: { horizontal: 75, vertical: 'bottom' }
        }
      }}
      onChange={(id) => {
        const sortOption = sortOptions[id as string];
        handleSortClick(sortOption);
      }}
    />
  );
}
