import { Suspense } from 'react';

export default function withSuspense<ComponentProps>(
  Component: React.ComponentType<ComponentProps>,
  LoaderComponent: React.ComponentType<ComponentProps>
) {
  const ComponentWithSuspense = (props: ComponentProps & {}) => {
    return (
      <Suspense fallback={<LoaderComponent {...props} />}>
        <Component {...props} />
      </Suspense>
    );
  };

  return ComponentWithSuspense;
}
