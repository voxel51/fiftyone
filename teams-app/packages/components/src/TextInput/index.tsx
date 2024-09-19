import { Visibility, VisibilityOff } from '@mui/icons-material';
import {
  Box,
  BoxProps,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  TextFieldProps,
  Typography
} from '@mui/material';
import { useState } from 'react';
import StringElementNullish from '../StringElementNullish';

type TextInputProps = TextFieldProps & {
  fieldLabel?: string;
  containerProps?: BoxProps;
  description?: string | JSX.Element;
  caption?: string | JSX.Element;
};

export default function TextInput(props: TextInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const {
    fieldLabel,
    type,
    InputProps = {},
    containerProps = {},
    description,
    caption,
    ...textFieldProps
  } = props;
  let computedInputProps = {};
  let computedType = type;
  if (type === 'password') {
    computedInputProps = {
      endAdornment: (
        <InputAdornment position="end">
          <IconButton
            aria-label="toggle password visibility"
            onClick={() => setShowPassword(!showPassword)}
            edge="end"
            title={showPassword ? 'Hide content' : 'Show content'}
            sx={{
              color: (theme) => theme.palette.text.tertiary
            }}
          >
            {showPassword ? <VisibilityOff /> : <Visibility />}
          </IconButton>
        </InputAdornment>
      )
    };
    if (showPassword) computedType = 'text';
  }
  computedInputProps = { ...computedInputProps, ...InputProps };

  return (
    <Box width="100%" {...containerProps}>
      {(fieldLabel || description || caption) && (
        <Stack sx={{ pb: 1 }}>
          {fieldLabel && <Typography>{fieldLabel}</Typography>}
          {description && (
            <StringElementNullish color="text.tertiary">
              {description}
            </StringElementNullish>
          )}
        </Stack>
      )}
      <TextField
        type={computedType}
        size="small"
        fullWidth
        {...textFieldProps}
        InputProps={computedInputProps}
      />
      <StringElementNullish
        color="text.tertiary"
        variant="subtitle2"
        sx={{ pl: 0.5 }}
      >
        {caption}
      </StringElementNullish>
    </Box>
  );
}

export { TextInputProps };
