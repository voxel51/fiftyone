import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { ErrorBoundary } from "./ErrorBoundary";
import { MediaTypeFo3dComponent } from "./MediaTypeFo3d";
import { MediaTypePcdComponent } from "./MediaTypePcd";
import { ActionBar } from "./action-bar";
import { Container } from "./containers";
import { currentActionAtom } from "./state";

/**
 * This component is responsible for rendering both "3d" as well as "point_cloud" media types.
 *
 * While "point_cloud" media type is subsumed by "3d" media type, we still need to support it for backwards compatibility.
 */
export const Looker3d = () => {
  const mediaType = useRecoilValue(fos.mediaType);
  const hasFo3dSlice = useRecoilValue(fos.hasFo3dSlice);
  const hasPcdSlices = useRecoilValue(fos.allPcdSlices).length > 0;

  const [isHovering, setIsHovering] = useState(false);
  const timeout = useRef<NodeJS.Timeout>(null);
  const hoveringRef = useRef(false);

  const setCurrentAction = useSetRecoilState(currentActionAtom);

  const shouldRenderPcdComponent = useMemo(
    () =>
      mediaType === "point_cloud" || (mediaType === "group" && hasPcdSlices),
    [mediaType, hasPcdSlices]
  );
  const shouldRenderFo3dComponent = useMemo(
    () => mediaType === "three_d" || (mediaType === "group" && hasFo3dSlice),
    [mediaType, hasFo3dSlice]
  );

  const clear = useCallback(() => {
    if (hoveringRef.current) return;
    timeout.current && clearTimeout(timeout.current);
    setIsHovering(false);
    setCurrentAction(null);
  }, [setCurrentAction]);

  const update = useCallback(() => {
    !isHovering && setIsHovering(true);
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(clear, 3000);

    return () => {
      timeout.current && clearTimeout(timeout.current);
    };
  }, [clear, isHovering]);

  if (mediaType === "group" && hasFo3dSlice && hasPcdSlices) {
    return (
      <div>
        Only allowed to have either one fo3d slice or one or more pcd slices in
        a group.
      </div>
    );
  }

  if (shouldRenderPcdComponent || shouldRenderFo3dComponent) {
    return (
      <ErrorBoundary>
        <Container
          onMouseOver={update}
          onMouseMove={update}
          data-cy={"looker3d"}
        >
          {shouldRenderPcdComponent ? (
            <MediaTypePcdComponent isHovering={isHovering} />
          ) : (
            <MediaTypeFo3dComponent />
          )}
          {(hoveringRef.current || isHovering) && (
            <ActionBar
              onMouseEnter={() => {
                hoveringRef.current = true;
              }}
              onMouseLeave={() => {
                hoveringRef.current = false;
              }}
            />
          )}
        </Container>
      </ErrorBoundary>
    );
  }

  return <div>Unsupported media type: {mediaType}</div>;
};
