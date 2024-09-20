import {
  Button as MUIButton,
  ButtonProps,
  CircularProgress
} from '@mui/material';

type PropTypes = ButtonProps & { loading?: boolean };

export default function Button({ children, loading, ...props }: PropTypes) {
  return (
    <MUIButton {...props}>
      {children}{' '}
      {loading && <CircularProgress size={16} sx={{ position: 'absolute' }} />}
    </MUIButton>
  );
}
