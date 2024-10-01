import { useMemo } from 'react';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Button, ButtonProps } from '@mui/material';

interface Props {
  onClick?: () => void;
  style?: 'primary.submit' | 'white.cancel' | 'error';
  buttonText?: string;
  overrideStyle?: {};
  loading?: boolean;
  loadingText?: string;
}

export default function SimpleButton(props: Props & ButtonProps) {
  const theme = useTheme();
  const { buttonText, onClick, style, overrideStyle, loadingText, ...rest } =
    props;

  const buttonProps = useMemo(() => {
    return {
      'primary.submit': {
        background: theme.palette.voxel[500],
        '&:hover': {
          background: theme.palette.voxel[600]
        },
        borderRadius: 2,
        color: theme.palette.text.secondary
      },
      'white.cancel': {
        marginRight: 1,
        border: `1px solid ${theme.palette.grey[500]}`,
        background: theme.palette.grey[50],
        '&:hover': {
          background: theme.palette.grey[200]
        },
        borderRadius: 2,
        color: theme.palette.grey[600]
      }
    };
  }, [theme]);

  return (
    <Button
      {...rest}
      sx={{
        ...(style ? buttonProps[style] : {}),
        ...props?.overrideStyle,
        ...props?.sx
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (props?.onClick) {
          props.onClick();
        }
      }}
    >
      {props.loading && (
        <Typography
          variant="body1"
          fontWeight="medium"
          color={buttonProps[style].color}
        >
          {loadingText || buttonText || '...'}
        </Typography>
      )}
      {!props.loading && buttonText && (
        <Typography
          variant="body1"
          fontWeight="medium"
          color={buttonProps[style].color}
        >
          {buttonText}
        </Typography>
      )}
      {!buttonText && !!props.loading ? props.loading : props.children}
    </Button>
  );
}
