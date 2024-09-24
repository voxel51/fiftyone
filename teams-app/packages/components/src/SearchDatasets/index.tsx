import { useSearchAdornment } from '@fiftyone/hooks';
import useDatasetsFilter from '@fiftyone/hooks/src/datasets/DatasetList/useFilters';
import {
  CONSTANT_VARIABLES,
  datasetSearchTermState,
  searchInputState,
  searchSuggestions,
  searchTermState
} from '@fiftyone/teams-state';
import { SearchSuggestionResult } from '@fiftyone/teams-state/src/Datasets';
import { Close } from '@mui/icons-material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  TextField,
  Typography
} from '@mui/material';
import { throttle } from 'lodash';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useRecoilState,
  useRecoilValueLoadable,
  useResetRecoilState,
  useSetRecoilState
} from 'recoil';

const { DEFAULT_SUGGESTION_COUNT, SEARCH_INPUT_DEBOUNCE } = CONSTANT_VARIABLES;

// @ts-ignore
export default function SearchDatasets() {
  const setDatasetSearchTerm = useSetRecoilState(datasetSearchTermState);
  const [term, setTerm] = useRecoilState(searchTermState);
  const resetTerm = useResetRecoilState(searchTermState);
  const [searchInput, setSearchInput] = useRecoilState(searchInputState);
  const prefixes = ['name:', 'tags:'];
  const { typeAdornment, displayWithoutAdornment } = useSearchAdornment(
    prefixes,
    searchInput
  );
  const router = useRouter();

  const resetSearchInput = useResetRecoilState(searchInputState);
  const setTermRecoil = useCallback(
    throttle(setTerm, SEARCH_INPUT_DEBOUNCE),
    []
  );
  const [suggestions, setSuggestions] = useState<SearchSuggestionResult[]>([]);
  const { state, contents } = useRecoilValueLoadable(searchSuggestions);
  const options = state === 'hasValue' ? contents : [];

  const { searchHelpText } = useDatasetsFilter();

  useEffect(() => {
    if (state === 'hasValue' || !term) setSuggestions(options);
  }, [state, term]);

  const visibleSuggestions = suggestions?.slice(0, DEFAULT_SUGGESTION_COUNT);
  const moreSuggestions = suggestions?.slice(DEFAULT_SUGGESTION_COUNT);
  const moreSuggestionsLen = moreSuggestions?.length;

  const computedOptions = useMemo(() => {
    const options: SearchSuggestionResult[] = [];
    if (term)
      options.push({ label: searchInput, help: searchHelpText, type: 'help' });
    if (Array.isArray(visibleSuggestions)) options.push(...visibleSuggestions);
    if (moreSuggestionsLen)
      options.push({
        label: `+${moreSuggestionsLen} more`,
        type: 'hidden_count'
      });
    return options;
  }, [term, suggestions]);

  const handleDeleteTypeAdornment = () => {
    setSearchInput(displayWithoutAdornment);
    setTermRecoil(displayWithoutAdornment);
  };

  return (
    <Autocomplete
      data-testid="search-datasets"
      autoHighlight
      freeSolo={false}
      multiple={false}
      options={computedOptions}
      onChange={async (_, suggestion, reason) => {
        // avoid premature clearing of input
        if (['clear', 'createOption'].indexOf(reason) > -1) return;

        let fields = ['name'];
        let term = '';
        if (suggestion) {
          // route directly to the dataset on suggestion selection
          if (suggestion.type === 'Dataset' && suggestion?.slug) {
            router.push(`/datasets/${suggestion.slug}/samples`);
            return;
          }

          if (
            suggestion.type !== 'help' &&
            suggestion.type !== 'hidden_count' &&
            suggestion?.field
          ) {
            fields = [suggestion.field];
            term = `${suggestion.field}:${suggestion.label}`;
          } else {
            fields = ['name', 'tags'];
            term = searchInput;
          }
        }
        const searchOptions = { fields, term };
        if (reason === 'selectOption') {
          setDatasetSearchTerm(searchOptions);
        }
      }}
      filterOptions={(options) => {
        return options;
      }}
      inputValue={displayWithoutAdornment}
      onInputChange={(e, value, reason) => {
        if (reason === 'clear') {
          resetTerm();
          return;
        }
        if (e && reason !== 'reset') {
          const adjustedValue = typeAdornment
            ? [typeAdornment, value].join(':')
            : value;
          setSearchInput(adjustedValue);
          setTermRecoil(adjustedValue);
        }
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
          if (searchInput === `${typeAdornment}:`) {
            handleDeleteTypeAdornment();
          }
        }
      }}
      getOptionLabel={() => ''}
      componentsProps={{
        clearIndicator: { color: 'secondary', size: 'small' }
      }}
      renderInput={(params) => {
        return (
          <TextField
            data-testid="datasets-search-field"
            {...params}
            InputProps={{
              ...params.InputProps,
              autoFocus: true,
              startAdornment: (
                <Box display="flex" alignItems="center">
                  <SearchOutlinedIcon
                    color="secondary"
                    sx={{ ml: 1, mr: 0.25 }}
                  />
                  {typeAdornment && (
                    <Chip
                      size="small"
                      label={typeAdornment}
                      onDelete={handleDeleteTypeAdornment}
                    />
                  )}
                </Box>
              ),
              endAdornment: (
                <Box display="flex" mr={-4.5} alignItems="center">
                  {state === 'loading' && term && (
                    <CircularProgress
                      size={14}
                      sx={{ mr: 0.5 }}
                      data-testid="search-in-progress-icon"
                    />
                  )}
                  <IconButton
                    onClick={() => {
                      resetTerm();
                      resetSearchInput();
                    }}
                  >
                    <Close
                      sx={{
                        fontSize: 16,
                        color: (theme) => theme.palette.text.secondary,
                        borderRadius: '50%',
                        ':hover': {
                          cursor: 'pointer'
                        }
                      }}
                      onClick={() => {
                        resetTerm();
                        resetSearchInput();
                      }}
                      data-testid="clear-search-input"
                    />
                  </IconButton>
                </Box>
              )
            }}
            placeholder="Ex: name, tags, name:foo, tags:bar"
            value={searchInput}
          />
        );
      }}
      renderOption={(props, option) => {
        if (option.type === 'hidden_count')
          return (
            <Typography
              {...props}
              className=""
              color="text.tertiary"
              sx={{
                textAlign: 'center',
                p: 0.5,
                mt: 0.5,
                borderTop: (theme) => `1px solid ${theme.palette.divider}`
              }}
            >
              {option.label}
            </Typography>
          );

        return (
          <li {...props} key={props.id}>
            <Typography>{option.label}</Typography>
            <Typography
              sx={{ ml: 1.25, fontSize: 12 }}
              color="text.tertiary"
              noWrap
            >
              {option.type === 'help' ? option.help : option.type}
            </Typography>
          </li>
        );
      }}
      size="small"
      sx={{ width: 282 }}
    />
  );
}
