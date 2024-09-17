import { Check } from '@mui/icons-material';
import {
  Box,
  BoxProps,
  CircularProgress,
  InputLabel,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  SelectProps,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { useMemo } from 'react';

type SelectionItemProps = {
  IconComponent?: React.ReactNode;
  caption?: string;
  description?: string;
  id: string;
  label: string;
  disabled?: boolean;
  disabledInfo?: string;
};

export type SelectionProps = {
  defaultValue?: string;
  disabled?: boolean;
  readOnly?: boolean;
  items: Array<SelectionItemProps>;
  menuSize?: 'auto' | 'xsmall' | 'small' | 'medium' | 'large';
  onChange?: (item: string | string[]) => void;
  showCheckmark?: boolean;
  value?: string | string[];
  selectProps?: SelectProps;
  containerProps?: BoxProps;
  noBorder?: boolean;
  label?: string;
  loading?: boolean;
  placeholder?: string;
  labelPrefix?: string;
  hidePlaceholder?: boolean;
};

export default function Selection(props: SelectionProps) {
  const {
    defaultValue: initialSelection,
    disabled,
    readOnly,
    items,
    menuSize,
    onChange: onSelect,
    showCheckmark = true,
    value: selected,
    selectProps = {},
    containerProps = {},
    noBorder,
    label,
    loading,
    placeholder,
    labelPrefix = '',
    hidePlaceholder = ''
  } = props;
  const theme = useTheme();
  const fallbackSelection = selectProps?.multiple ? [] : undefined;
  const [selectedState, setSelectedState] = React.useState(
    initialSelection || fallbackSelection
  );
  const itemsLabelById = useMemo(() => {
    const labelById = new Map();
    for (const { id, label } of items) {
      labelById.set(id, label);
    }
    return labelById;
  }, [items]);
  const currentSelection = selected || selectedState;
  const selectionLabel = useMemo(
    () => getLabel(currentSelection, itemsLabelById),
    [currentSelection, itemsLabelById]
  );
  const menuSizeToWidth = {
    xsmall: '8rem',
    small: '16rem',
    medium: '24rem',
    large: '32rem'
  };
  const menuWidth =
    menuSize === 'auto'
      ? undefined
      : menuSizeToWidth[menuSize] || menuSizeToWidth.medium;
  const defaultPlaceholder = hidePlaceholder
    ? ''
    : selectProps?.multiple
      ? 'Select one or more options'
      : 'Select an option';

  if (readOnly) return <Typography>{selectionLabel}</Typography>;

  return (
    <Box {...containerProps}>
      {label && <InputLabel sx={{ pb: 0.5 }}>{label}</InputLabel>}
      <Select
        disabled={disabled}
        value={currentSelection}
        onChange={(e) => {
          const selectedItem = e.target.value;
          setSelectedState(selectedItem);
          if (onSelect) onSelect(selectedItem);
        }}
        displayEmpty
        inputProps={{
          'data-testid': 'select'
        }}
        renderValue={() => {
          const label = selectionLabel || placeholder || defaultPlaceholder;
          return `${labelPrefix}${label}`;
        }}
        size="small"
        endAdornment={
          loading ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null
        }
        MenuProps={{
          anchorOrigin: {
            horizontal: 'center',
            vertical: 'bottom'
          },
          PaperProps: {
            sx: { width: menuWidth, maxHeight: '50vh' }
          }
        }}
        sx={{
          color: (theme) =>
            theme.palette.text[selectionLabel ? 'primary' : 'tertiary']
        }}
        {...selectProps}
      >
        {items.map(
          (
            {
              caption,
              description,
              label,
              IconComponent,
              id,
              disabled,
              disabledInfo
            },
            i
          ) => {
            const isItemSelected = Array.isArray(currentSelection)
              ? currentSelection.includes(id)
              : currentSelection === id;
            return (
              <MenuItem
                data-testid={`select-item-${label}`}
                disabled={disabled}
                value={id}
                key={id}
                sx={
                  i !== items.length - 1 && !noBorder
                    ? {
                        borderBottom: '1px solid',
                        borderColor: theme.palette.divider
                      }
                    : { width: '100%' }
                }
              >
                {IconComponent && <ListItemIcon>{IconComponent}</ListItemIcon>}
                <ListItemText
                  primary={
                    <Typography variant="body1" color="text.primary">
                      {label}
                    </Typography>
                  }
                  secondary={
                    <Box>
                      {description && (
                        <Typography
                          sx={{ whiteSpace: 'pre-wrap' }}
                          component="p"
                          variant="caption"
                          color="text.secondary"
                        >
                          {description}
                        </Typography>
                      )}
                      {caption && (
                        <Typography
                          sx={{
                            whiteSpace: 'pre-wrap',
                            fontStyle: 'italic',
                            paddingTop: '8px'
                          }}
                          component="p"
                          variant="caption"
                          color="text.secondary"
                        >
                          {caption}
                        </Typography>
                      )}
                      {disabledInfo && (
                        <Typography
                          color="text.primary"
                          sx={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}
                        >
                          {disabledInfo}
                        </Typography>
                      )}
                    </Box>
                  }
                ></ListItemText>

                <ListItemIcon sx={{ justifyContent: 'flex-end' }}>
                  {showCheckmark && isItemSelected && <Check />}
                </ListItemIcon>
              </MenuItem>
            );
          }
        )}
      </Select>
    </Box>
  );
}

function getLabel(
  selection: string | Array<string>,
  itemsLabelById: Map<string, string>
) {
  const selectionArray = Array.isArray(selection) ? selection : [selection];
  return selectionArray.map((id) => itemsLabelById.get(id)).join(', ');
}
