import React, { PropsWithChildren, Suspense, useEffect, useState } from "react";
import { PreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { OperationType, VariablesOf } from "relay-runtime";

import Resource from "./Resource";
import { RouteComponent } from "./RouteComponent";
import { routingContext } from "./RoutingContext";

const RouteHandler = <T extends OperationType>(
  props: PropsWithChildren<{
    component: Resource<RouteComponent<T>>;
    prepared: Resource<PreloadedQuery<T>>;
    routeData: { params: VariablesOf<T> };
  }>
) => {
  const Component = props.component.read();
  const { routeData, prepared } = props;
  return (
    <Suspense fallback={null}>
      <Component
        routeData={routeData}
        prepared={prepared.read()}
        children={props.children}
      />
    </Suspense>
  );
};

const RouterRenderer: React.FC = () => {
  const router = useRecoilValue(routingContext);
  const [routeEntry, setRouteEntry] = useState(router.get());
  useEffect(() => {
    const currentEntry = router.get();
    if (currentEntry !== routeEntry) {
      setRouteEntry(currentEntry);
      return;
    }
    const dispose = router.subscribe((nextEntry) => {
      setRouteEntry(nextEntry);
    });
    return () => dispose();
  }, [router]);

  const reversedItems = [...routeEntry.entries].reverse();

  const firstItem = reversedItems[0];
  let routeComponent = (
    <RouteHandler
      component={firstItem.component}
      prepared={firstItem.prepared}
      routeData={firstItem.routeData}
    />
  );
  for (let ii = 1; ii < reversedItems.length; ii++) {
    const nextItem = reversedItems[ii];
    routeComponent = (
      <RouteHandler
        component={nextItem.component}
        prepared={nextItem.prepared}
        routeData={nextItem.routeData}
      >
        {routeComponent}
      </RouteHandler>
    );
  }

  return <>{routeComponent}</>;
};

export default RouterRenderer;
