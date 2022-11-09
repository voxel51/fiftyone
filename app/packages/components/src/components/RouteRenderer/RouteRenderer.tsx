import { Entry, Route, RouteData, RoutingContext } from "@fiftyone/state";
import { Resource } from "@fiftyone/utilities";
import React, {
  PropsWithChildren,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";
import Loading from "../Loading";

const RouteHandler = <T extends OperationType | undefined = OperationType>(
  props: PropsWithChildren<{
    component: Resource<Route<T>>;
    prepared?:
      | Resource<PreloadedQuery<T extends undefined ? never : T>>
      | undefined;
    routeData?: RouteData<T>;
  }>
) => {
  const Component = props.component.read();
  const { routeData, prepared } = props;
  return (
    <Component
      routeData={routeData}
      prepared={prepared && prepared.read()}
      children={props.children}
    />
  );
};

const RouterRenderer: React.FC<{ router: RoutingContext }> = ({ router }) => {
  const [routeEntry, setRouteEntry] = useState(router.get());
  const routeEntryRef = useRef(routeEntry);
  routeEntryRef.current = routeEntry;
  const [loadingEntry, setLoadingEntry] = useState<Entry<OperationType>>();
  useEffect(() => {
    const dispose = router.subscribe((nextEntry) => {
      setRouteEntry(nextEntry);
      setLoadingEntry(routeEntryRef.current);
    });

    return () => dispose();
  }, [router]);

  return (
    <Suspense
      fallback={
        loadingEntry ? (
          <Routes routes={loadingEntry.entries} />
        ) : (
          <Loading>Pixelating...</Loading>
        )
      }
    >
      <Routes routes={routeEntry.entries} />
    </Suspense>
  );
};

const Routes = <T extends OperationType | undefined = OperationType>({
  routes,
}: {
  routes: {
    component: Resource<Route<T>>;
    prepared?:
      | Resource<PreloadedQuery<T extends undefined ? never : T>>
      | undefined;
    routeData?: RouteData<T>;
  }[];
}) => {
  const reversedItems = [...routes].reverse();

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
