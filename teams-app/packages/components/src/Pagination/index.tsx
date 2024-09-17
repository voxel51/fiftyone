import React, { SyntheticEvent, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Pagination as MuiPagination,
  PaginationProps,
  PaginationItem,
  BoxProps,
  Typography,
  Autocomplete,
  TextField
} from '@mui/material';
import {
  KeyboardDoubleArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  ArrowDropDown
} from '@mui/icons-material';
import TextInput from '../TextInput';
import { DEFAULT_LIST_PAGE_SIZES } from '@fiftyone/teams-state/src/constants';

interface Props extends PaginationProps {
  containerProps?: BoxProps;
  pageSize?: number;
  onManualPageChange: (inputPage: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  availablePageSizes?: Array<string>;
  disablePageSizeSelection?: boolean;
}

const DIGITS_ONLY_REGEX = /^[0-9]*$/;

export default function Pagination(props: Props) {
  const {
    containerProps = {},
    onManualPageChange,
    onPageSizeChange,
    pageSize,
    availablePageSizes,
    disablePageSizeSelection,
    ...rest
  } = props;
  const showManualInput = props.count > 1;
  const [customPage, setCustomPage] = useState<number | undefined>(props.page);
  const iconStyle = useMemo(() => {
    return {
      color: (theme) => theme.palette.grey[500],
      fontSize: 24
    };
  }, []);

  // so that the custom page input always reflect the current page
  useEffect(() => {
    if (props.page) {
      setCustomPage(props.page);
    }
  }, [props.page, setCustomPage]);

  return (
    <Box
      paddingTop={4}
      justifyContent="center"
      display="flex"
      alignItems="center"
      {...containerProps}
    >
      <Box display="flex" alignItems="center">
        <Autocomplete
          disabled={disablePageSizeSelection}
          disablePortal
          closeText=""
          clearIcon={null}
          id="combo-box-demo"
          options={availablePageSizes || DEFAULT_LIST_PAGE_SIZES}
          clearOnBlur
          sx={{
            '&.MuiAutocomplete-root .MuiAutocomplete-inputRoot': {
              padding: '0 !important',
              fontSize: '14px',
              cursor: 'pointer'
            },
            '.MuiOutlinedInput-root .MuiAutocomplete-input': {
              padding: '.5rem 1.25rem !important'
            },
            '.MuiOutlinedInput-root .MuiAutocomplete-endAdornment': {
              right: 5,
              top: 5
            }
          }}
          disableListWrap
          multiple={false}
          value={pageSize.toString()}
          renderInput={({ inputProps, ...rest }) => {
            return (
              <TextField
                {...rest}
                inputProps={{ ...inputProps, readOnly: true }}
              />
            );
          }}
          popupIcon={<ArrowDropDown sx={{ height: '100%' }} />}
          onChange={(_: SyntheticEvent<Element, Event>, newValue: string) => {
            if (newValue) {
              onPageSizeChange(Number(newValue));
            }
          }}
        />
      </Box>
      <MuiPagination
        showFirstButton
        showLastButton
        boundaryCount={2}
        siblingCount={1}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          position: 'relative'
        }}
        renderItem={(item) => (
          <PaginationItem
            components={{
              first: (props) => (
                <Box display="flex" {...props} sx={{ alignItems: 'end' }} data-testid="go-to-first-page">
                  <KeyboardDoubleArrowLeft sx={iconStyle} />
                </Box>
              ),
              last: (props) => (
                <Box display="flex" {...props} sx={{ alignItems: 'end' }} data-testid="go-to-last-page">
                  <KeyboardDoubleArrowRight sx={iconStyle} />
                </Box>
              ),
              previous: (props) => (
                <Box display="flex" {...props} sx={{ alignItems: 'end' } } data-testid="go-to-previous-page">
                  <KeyboardArrowLeft sx={iconStyle} />
                </Box>
              ),
              next: (props) => (
                <Box display="flex" {...props} sx={{ alignItems: 'end' }} data-testid="go-to-next-page">
                  <KeyboardArrowRight sx={iconStyle} />
                </Box>
              )
            }}
            {...item}
          />
        )}
        {...rest}
      />
      {showManualInput && (
        <>
          <TextInput
            value={customPage || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (DIGITS_ONLY_REGEX.test(val)) {
                try {
                  setCustomPage(parseInt(val));
                } catch (e) {}
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customPage <= props.count) {
                onManualPageChange &&
                  customPage &&
                  onManualPageChange(customPage);
              }
            }}
            autoComplete="off"
            containerProps={{
              width: 50,
              height: '100%',
              padding: '.25rem',
              textAlign: 'center'
            }}
            inputProps={{ sx: { padding: '0.5rem', borderRadius: '.25rem' } }}
            disabled={props.disabled}
          />
          <Typography fontSize="small">
            {props.page ? `of ${props.count}` : ''}
          </Typography>
        </>
      )}
    </Box>
  );
}
