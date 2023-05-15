import React from "react";
import { Suspense } from "react";

export default function withSuspense<ComponentProps>(
  Component: React.ComponentType<ComponentProps>,
  LoaderComponent: React.ComponentType<ComponentProps>
) {
  const ComponentWithSuspense = (props: ComponentProps) => {
    const Loading = LoaderComponent || DefaultLoader;
    return (
      <Suspense fallback={<Loading {...props} />}>
        <Component {...props} />
      </Suspense>
    );
  };

  return ComponentWithSuspense;
}

function DefaultLoader() {
  return null;
}
