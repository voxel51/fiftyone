import React from "react";

export class AssetErrorBoundary extends React.Component<any> {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      // todo: add indicator in canvas that asset failed loading
      return null;
    }

    // @ts-ignore
    return this.props.children;
  }
}
