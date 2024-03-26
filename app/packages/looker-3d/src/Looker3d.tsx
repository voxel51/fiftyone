import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { ErrorBoundary } from "./ErrorBoundary";
import { MediaTypePcdComponent } from "./MediaTypePcd";
import { ActionBar } from "./action-bar";
import { Container } from "./containers";
import { MediaTypeFo3dComponent } from "./fo3d/MediaTypeFo3d";
import { useHotkey } from "./hooks";
import { currentActionAtom, isGridOnAtom } from "./state";

/**
 * This component is responsible for rendering both "3d" as well as
 * "point_cloud" media types.
 *
 * While "point_cloud" media type is subsumed by "3d" media type, we still
 * need to support it for backwards compatibility.
 */
export const Looker3d = () => {
  const mediaType = useRecoilValue(fos.mediaType);
  const hasFo3dSlice = useRecoilValue(fos.hasFo3dSlice);
  const hasPcdSlices = useRecoilValue(fos.allPcdSlices).length > 0;
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);
  const parentMediaType = useRecoilValue(fos.parentMediaTypeSelector);

  const [isHovering, setIsHovering] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);
  const hoveringRef = useRef(false);

  const setCurrentAction = useSetRecoilState(currentActionAtom);

  const shouldRenderPcdComponent = useMemo(
    () =>
      mediaType === "point_cloud" ||
      (mediaType === "group" && hasPcdSlices) ||
      (isDynamicGroup && parentMediaType === "point_cloud"),
    [mediaType, hasPcdSlices, isDynamicGroup, parentMediaType]
  );
  const shouldRenderFo3dComponent = useMemo(
    () =>
      mediaType === "three_d" ||
      (mediaType === "group" && hasFo3dSlice) ||
      (isDynamicGroup && parentMediaType === "three_d"),
    [mediaType, hasFo3dSlice, isDynamicGroup, parentMediaType]
  );

  const sampleMap = useRecoilValue(fos.activePcdSlicesToSampleMap);

  useHotkey(
    "KeyG",
    async ({ set }) => {
      set(isGridOnAtom, (prev) => !prev);
    },
    []
  );

  useHotkey(
    "Escape",
    async ({ snapshot, set }) => {
      const panels = await snapshot.getPromise(fos.lookerPanels);
      const currentAction = await snapshot.getPromise(currentActionAtom);

      if (currentAction) {
        set(currentActionAtom, null);
        return;
      }

      for (const panel of ["help", "json"]) {
        if (panels[panel].isOpen) {
          set(fos.lookerPanels, {
            ...panels,
            [panel]: { ...panels[panel], isOpen: false },
          });
          return;
        }
      }

      // don't proceed if sample being hovered on is from looker2d
      const hovered = await snapshot.getPromise(fos.hoveredSample);
      const isHoveredSampleNotInLooker3d =
        hovered &&
        !Object.values(sampleMap).find((s) => s.sample._id === hovered._id);

      if (isHoveredSampleNotInLooker3d) {
        return;
      }

      const selectedLabels = await snapshot.getPromise(fos.selectedLabels);
      if (selectedLabels && selectedLabels.length > 0) {
        set(fos.selectedLabelMap, {});
        return;
      }

      set(fos.hiddenLabels, {});
      set(fos.currentModalSample, null);
    },
    [sampleMap, isHovering],
    false
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
        Only one fo3d slice or one or more pcd slices is allowed in a group.
      </div>
    );
  }

  if (!shouldRenderPcdComponent && !shouldRenderFo3dComponent) {
    return <div>Unsupported media type: {mediaType}</div>;
  }

  const component = shouldRenderFo3dComponent ? (
    <MediaTypeFo3dComponent />
  ) : (
    <MediaTypePcdComponent />
  );

  return (
    <ErrorBoundary>
      <Container onMouseOver={update} onMouseMove={update} data-cy={"looker3d"}>
        {component}
        <ActionBar
          onMouseEnter={() => {
            hoveringRef.current = true;
          }}
          onMouseLeave={() => {
            hoveringRef.current = false;
          }}
        />
      </Container>
    </ErrorBoundary>
  );
};
