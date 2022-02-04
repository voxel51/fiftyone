import React from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";
import Resource from "./Resource";
import { RouteComponent } from "./RouteComponent";
import RoutingContext from "./RoutingContext";

const { useContext, useEffect, Suspense, useState } = React;

const RouteComponent: React.FC<{
  component: Resource<RouteComponent>;
  prepared: Resource<PreloadedQuery<OperationType>>;
  routeData: { params: unknown };
}> = (props) => {
  const Component = props.component.read();
  const { routeData, prepared } = props;
  return (
    <Component
      routeData={routeData}
      prepared={prepared.read()}
      children={props.children}
    />
  );
};

const RouterRenderer: React.FC<{}> = () => {
  const router = useContext(RoutingContext);
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

  const reversedItems = [].concat(routeEntry.entries).reverse();
  const firstItem = reversedItems[0];
  let routeComponent = (
    <RouteComponent
      component={firstItem.component}
      prepared={firstItem.prepared}
      routeData={firstItem.routeData}
    />
  );
  for (let ii = 1; ii < reversedItems.length; ii++) {
    const nextItem = reversedItems[ii];
    routeComponent = (
      <RouteComponent
        component={nextItem.component}
        prepared={nextItem.prepared}
        routeData={nextItem.routeData}
      >
        {routeComponent}
      </RouteComponent>
    );
  }

  return <Suspense fallback={"Loading fallback..."}>{routeComponent}</Suspense>;
};

export default RouterRenderer;
