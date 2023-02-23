import { Loading } from "@fiftyone/components";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { Queries } from ".";
import { Entry, RoutingContext } from "./RouterContext";

const Renderer: React.FC<{ router: RoutingContext<Queries> }> = ({
  router,
}) => {
  const [routeEntry, setRouteEntry] = useState(router.get());
  const routeEntryRef = useRef(routeEntry);
  routeEntryRef.current = routeEntry;
  const [loadingEntry, setLoadingEntry] = useState<Entry<Queries>>();
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
          <Route route={loadingEntry} />
        ) : (
          <Loading>Pixelating...</Loading>
        )
      }
    >
      <Route route={routeEntry} />
    </Suspense>
  );
};

const Route = <T extends Queries>({ route }: { route: Entry<T> }) => {
  const Component = route.component.read();
  const { routeData, prepared } = route;

  return <Component routeData={routeData} prepared={prepared.read()} />;
};

export default Renderer;
