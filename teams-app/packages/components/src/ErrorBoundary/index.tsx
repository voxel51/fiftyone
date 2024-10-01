import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';

type Props = {
  children?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  Component?: JSX.Element;
};

type State = {
  hasError: boolean;
};

class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };
  public onError: Props['onError'];
  public Component: JSX.Element;

  public constructor(props: Props) {
    super(props);
    this.onError = props.onError;
    this.Component = props.Component;
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(error);
    console.error(errorInfo);
    if (typeof this.onError === 'function') this.onError(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.Component) return this.Component;

      return (
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="body2">
            Something went wrong. Please refer to browser's console for details.
          </Typography>
          <Button
            variant="contained"
            onClick={() => {
              window.location.reload();
            }}
            sx={{ mt: 2 }}
          >
            Try again
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
