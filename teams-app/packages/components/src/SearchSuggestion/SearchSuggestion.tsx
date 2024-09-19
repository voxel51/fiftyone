import {
  datasetSearchTermState,
  SearchSuggestionResult,
  searchSuggestions,
  searchTermState
} from '@fiftyone/teams-state';
import { Box, ClickAwayListener, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DatasetSearchFields } from '@fiftyone/teams-state/src/Datasets/__generated__/DatasetsListQuery.graphql';
import { useCallback, useEffect, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';

const DEFAULT_SUGGESTION_COUNT = 5;

// TODO:MANI - refactor this and memoise it / or use a lib
function BoldedText({ text, shouldBeBold }) {
  if (!text || !shouldBeBold) {
    return null;
  }

  const textArray = text.split(RegExp(shouldBeBold, 'ig'));
  const match = text.match(RegExp(shouldBeBold, 'ig'));

  return (
    <span>
      {textArray.map((item, index) => (
        <>
          {item}
          {index !== textArray.length - 1 && match && <b>{match[index]}</b>}
        </>
      ))}
    </span>
  );
}

export default function SearchSuggestion() {
  const theme = useTheme();
  const [open, setOpen] = useState(true);

  const setDatasetSearchTerm = useSetRecoilState<{
    fields: string[];
    term: string;
  } | null>(datasetSearchTermState);
  const suggestions: SearchSuggestionResult[] =
    useRecoilValue(searchSuggestions);
  const searchTerm = useRecoilValue(searchTermState);
  const visibleSuggestions = suggestions?.slice(0, DEFAULT_SUGGESTION_COUNT);
  const moreSuggestions = suggestions?.slice(DEFAULT_SUGGESTION_COUNT);
  const moreSuggestionsLen = moreSuggestions?.length;

  const handleClickAway = () => {
    setOpen(false);
  };

  useEffect(() => {
    setOpen(!!suggestions.length);
  }, [suggestions]);

  const handleSuggestionClick = useCallback(
    (suggestion: SearchSuggestionResult) => {
      setOpen(false);
      setDatasetSearchTerm({
        fields: [suggestion.field] as DatasetSearchFields[],
        term: suggestion.label
      });
    },
    []
  );

  if (!searchTerm && !suggestions.length) {
    return null;
  }

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box>
        {open ? (
          <Box
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              width: 260,
              backgroundColor: theme.palette.background.paper,
              position: 'absolute',
              boxShadow: theme.shadows[1],
              padding: '0.5rem',
              zIndex: 999
            }}
          >
            <Box
              padding={1}
              sx={{
                cursor: 'pointer',
                background: theme.palette.action.hover
              }}
              display="flex"
              onClick={() =>
                handleSuggestionClick({
                  field: 'name',
                  label: '',
                  type: 'Dataset'
                })
              }
            >
              <Typography variant="body1" noWrap>
                {searchTerm}
              </Typography>
              <Typography variant="subtitle1" pl={1.5}>
                Search text
              </Typography>
            </Box>
            {visibleSuggestions.map((sg: SearchSuggestionResult) => {
              return (
                <Box
                  padding={1}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover
                    }
                  }}
                  display="flex"
                  onClick={() => handleSuggestionClick(sg)}
                >
                  <Typography variant="body1" noWrap>
                    {BoldedText({
                      text: sg.label,
                      shouldBeBold: searchTerm
                    })}
                  </Typography>
                  <Typography variant="subtitle1" pl={1.5}>
                    {sg.type}
                  </Typography>
                </Box>
              );
            })}
            {!!moreSuggestionsLen && (
              <Box
                padding={1}
                paddingBottom={0}
                display="flex"
                justifyContent="center"
                borderTop={`1px solid ${theme.palette.divider}`}
              >
                <Typography variant="subtitle1">
                  + {moreSuggestionsLen} more
                </Typography>
              </Box>
            )}
          </Box>
        ) : null}
      </Box>
    </ClickAwayListener>
  );
}
