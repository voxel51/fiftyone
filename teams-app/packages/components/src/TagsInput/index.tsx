import React, { useCallback, useState } from 'react';
import { useRecoilState, useRecoilValueLoadable } from 'recoil';
import { useRouter } from 'next/router';
import {
  Box,
  Typography,
  Autocomplete,
  TextField,
  CircularProgress
} from '@mui/material';
import { Tag } from '@fiftyone/teams-components';

import {
  datasetTagSearchTermState,
  datasetsByTagSuggestions,
  newDatasetTagsState
} from '@fiftyone/teams-state';
import { uniqBy } from 'lodash';

interface TagType {
  value: string;
  label: string;
}

interface PropsType {
  direction?: 'h' | 'v';
  disabled?: boolean;
  onChange?: (labels: string[]) => void;
  autoSave?: boolean;
  initialValues?: TagType[];
}

export default function TagsInput(props: PropsType) {
  const {
    query: { slug }
  } = useRouter();
  const { initialValues = [], direction, onChange, disabled } = props;
  const [input, setInput] = useState('');

  const dir = direction || 'v';
  const isVertical = dir === 'v';

  const [datasetTagSearchTerm, setDatasetTagSearchTerm] =
    useRecoilState<string>(datasetTagSearchTermState);
  const tagSuggestions = useRecoilValueLoadable<TagType[]>(
    datasetsByTagSuggestions
  );

  const [newTags, setNewTags] = useRecoilState<TagType[]>(
    newDatasetTagsState(initialValues)
  );

  const updateNewTags = useCallback(
    (tags: Array<TagType>) => {
      const uniqueTags = getUniqueTags(tags);
      setNewTags(uniqueTags);
      onChange && onChange(uniqueTags?.map((tag) => tag.value));
    },
    [newTags, slug]
  );

  const setInputValue = useCallback((value) => {
    setInput(value);
    setDatasetTagSearchTerm(value);
  }, []);

  const handleRemoveTag = useCallback(
    (tagLabel: string) => {
      const filteredTags = newTags.filter(
        ({ label }: TagType) => label !== tagLabel
      );
      updateNewTags(filteredTags);
    },
    [slug, newTags]
  );

  const suggestions =
    tagSuggestions?.state === 'hasValue' ? tagSuggestions?.contents : [];

  return (
    <Box
      display="flex"
      flexDirection={isVertical ? 'column' : 'row'}
      pt={2}
      width="100%"
      flex="3"
    >
      <Typography
        variant="body1"
        fontWeight="medium"
        noWrap
        pb={1}
        pl={0}
        flex="1"
      >
        Tags
      </Typography>
      <Box display="flex" flex="3" width="100%">
        <Autocomplete
          autoHighlight
          freeSolo
          value={newTags}
          disabled={!!disabled}
          multiple
          limitTags={4}
          id="multiple-limit-tags"
          getOptionLabel={(option: TagType) => option?.value}
          isOptionEqualToValue={(option: TagType, value: TagType) => {
            return option.value === value.value;
          }}
          renderOption={(props, option) => <li {...props}>{option.label}</li>}
          noOptionsText="+ create a new tag"
          disableCloseOnSelect
          options={[...suggestions].sort((a, b) => {
            let ai = suggestions.indexOf(a);
            ai = ai === -1 ? suggestions.length + suggestions.indexOf(a) : ai;
            let bi = suggestions.indexOf(b);
            bi = bi === -1 ? suggestions.length + suggestions.indexOf(b) : bi;
            return ai - bi;
          })}
          inputValue={input}
          renderInput={(params) => (
            <TextField
              {...params}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {tagSuggestions?.state === 'loading' && (
                      <CircularProgress size={16} />
                    )}
                    {params.InputProps.endAdornment}
                  </>
                )
              }}
              placeholder={
                !!disabled
                  ? ''
                  : 'Type to add tags. Use comma or tab to add multiple'
              }
            />
          )}
          onFocus={() => setDatasetTagSearchTerm('')}
          sx={{ width: '100%', display: 'flex', flex: '2' }}
          onInputChange={(e: any) => {
            const val = e?.target?.value;
            if (val && !val.endsWith(',')) {
              setInputValue(val);
            } else {
              setInputValue('');
            }
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
            // when creating new tags
            if (
              event.code === 'Enter' ||
              event.code === 'Comma' ||
              event.code === 'Tab'
            ) {
              event.preventDefault();
              const newTag = datasetTagSearchTerm?.split(',')?.[0];

              if (newTag) {
                updateNewTags([...newTags, { label: newTag, value: newTag }]);
              }
              setInputValue('');
            }
          }}
          clearOnEscape
          onChange={(_, values) => {
            const currentValues = values.map((value) =>
              typeof value === 'string' ? { value, label: value } : value
            );
            updateNewTags(currentValues);
            setInputValue('');
          }}
          renderTags={(tagValue) =>
            tagValue.map((option) => (
              <Tag
                key={option.value}
                label={option.value}
                title={option.label}
                onRemove={() => handleRemoveTag(option.label)}
                readOnly={!!disabled}
              />
            ))
          }
        />
      </Box>
    </Box>
  );
}

function getUniqueTags(tags: Array<TagType>) {
  return uniqBy(tags, 'value');
}
