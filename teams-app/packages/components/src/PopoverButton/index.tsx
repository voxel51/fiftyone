import {
  Button,
  ButtonProps,
  Popover,
  PopoverProps,
  SxProps,
  Theme
} from '@mui/material';
import * as React from 'react';

type PopoverButtonProps = {
  PopoverBody: React.ComponentType;
  PopoverButtonBody: React.ComponentType;
  popoverButtonProps?: ButtonProps;
  forceCloseCount?: number;
  popoverProps?: Omit<PopoverProps, 'open'>;
};

export default function PopoverButton({
  PopoverBody,
  PopoverButtonBody,
  popoverButtonProps = {},
  forceCloseCount,
  popoverProps = {}
}: PopoverButtonProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(
    null
  );

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  React.useEffect(handleClose, [forceCloseCount]);

  const open = Boolean(anchorEl);
  const id = open ? 'simple-popover' : undefined;

  return (
    <div>
      <Button
        aria-describedby={id}
        variant="contained"
        onClick={handleClick}
        {...popoverButtonProps}
      >
        <PopoverButtonBody />
      </Button>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right'
        }}
        {...popoverProps}
      >
        <PopoverBody />
      </Popover>
    </div>
  );
}
