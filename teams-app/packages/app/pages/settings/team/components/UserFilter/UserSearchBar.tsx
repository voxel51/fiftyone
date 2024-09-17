import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import Box from '@mui/joy/Box';
import { useCallback } from 'react';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';

import {
  userSearchInputState,
  userSearchTermState
} from '@fiftyone/teams-state';
import { Close } from '@mui/icons-material';
import { Chip, IconButton } from '@mui/material';
import TextField from '@mui/material/TextField';
import { useSearchAdornment } from '@fiftyone/hooks';
import { useRouter } from 'next/router';

export default function UserSearchBar() {
  const setUserSearchTerm = useSetRecoilState(userSearchTermState);
  const resetUserSearchTerm = useResetRecoilState(userSearchTermState);
  const resetSearch = useResetRecoilState(userSearchInputState);
  const { query } = useRouter();
  const { search: searchStr } = query;

  const [searchInput, setSearchInput] = useRecoilState(userSearchInputState);

  const prefixes = ['name:', 'email:'];
  const { typeAdornment, displayWithoutAdornment } = useSearchAdornment(
    prefixes,
    searchInput
  );

  const handleDeleteTypeAdornment = () => {
    setSearchInput(displayWithoutAdornment);
  };

  const searchUsers = useCallback(
    (input?: string) => {
      let value = input || '';
      const searchSegments = searchInput?.split(':');
      let fields = ['name', 'email'];
      let specificFields = fields.filter(
        (field) => searchSegments?.[0] === field
      );

      if (specificFields.length) {
        if (!searchSegments?.[1]) return;
        value = searchSegments?.[1] || '';
      }

      setUserSearchTerm({
        fields: specificFields.length ? specificFields : fields,
        term: value
      });
    },
    [searchInput, setUserSearchTerm]
  );

  return (
    <TextField
      size="small"
      sx={{ minWidth: '300px' }}
      InputProps={{
        autoFocus: true,
        startAdornment: (
          <Box display="flex" alignItems="center">
            <SearchOutlinedIcon color="secondary" sx={{ mr: 1 }} />
            {typeAdornment && <Chip size="small" label={typeAdornment} />}
          </Box>
        ),
        endAdornment:
          searchStr || searchInput ? (
            <Box display="flex" position="absolute" right={3}>
              <IconButton
                onClick={() => {
                  resetSearch();
                  resetUserSearchTerm();
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
                />
              </IconButton>
            </Box>
          ) : null
      }}
      placeholder="Ex: name, email, name:foo, email:bar"
      value={typeAdornment ? displayWithoutAdornment : searchInput}
      onChange={(e) => {
        e.preventDefault();
        const adjustedValue = typeAdornment
          ? [typeAdornment, e.target.value].join(':')
          : e.target.value;
        setSearchInput(adjustedValue);
      }}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') {
          searchUsers(searchInput);
        }
        if (ev.key === 'Backspace') {
          if (searchInput === `${typeAdornment}:`) {
            handleDeleteTypeAdornment();
          }
        }
      }}
    />
  );
}
