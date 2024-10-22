import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { Fo3dErrorBoundary } from "./ErrorBoundary";
import { MediaTypePcdComponent } from "./MediaTypePcd";
import { ActionBar } from "./action-bar";
import { Container } from "./containers";
import { Leva } from "./fo3d/Leva";
import { MediaTypeFo3dComponent } from "./fo3d/MediaTypeFo3d";
import { useHotkey } from "./hooks";
import {
  currentActionAtom,
  fo3dContainsBackground,
  isGridOnAtom,
} from "./state";

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
  const hasPcdSlices = useRecoilValue(fos.groupMediaTypesSet).has(
    "point_cloud"
  );
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);
  const parentMediaType = useRecoilValue(fos.parentMediaTypeSelector);

  const [isHovering, setIsHovering] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);
  const hoveringRef = useRef(false);

  const setCurrentAction = useSetRecoilState(currentActionAtom);

  const setFo3dHasBackground = useSetRecoilState(fo3dContainsBackground);

  const thisSampleId = useRecoilValue(fos.modalSampleId);

  useEffect(() => {
    return () => {
      setFo3dHasBackground(false);
    };
  }, []);

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

  const sampleMap = useRecoilValue(fos.active3dSlicesToSampleMap);

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
      const isTooltipLocked = await snapshot.getPromise(fos.isTooltipLocked);

      if (isTooltipLocked) {
        set(fos.isTooltipLocked, false);
        return;
      }

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

      const fullscreen = await snapshot.getPromise(fos.fullscreen);
      if (fullscreen) {
        set(fos.fullscreen, false);
        return;
      }

      const selectedLabels = await snapshot.getPromise(fos.selectedLabels);
      if (selectedLabels && selectedLabels.length > 0) {
        set(fos.selectedLabelMap, {});
        return;
      }

      set(fos.hiddenLabels, {});
      set(fos.modalSelector, null);
    },
    [sampleMap, isHovering],
    {
      useTransaction: false,
    }
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

  if (!shouldRenderPcdComponent && !shouldRenderFo3dComponent) {
    return <div>Unsupported media type: {mediaType}</div>;
  }

  const component = shouldRenderFo3dComponent ? (
    <MediaTypeFo3dComponent key={thisSampleId} />
  ) : (
    <MediaTypePcdComponent key={thisSampleId} />
  );

  return (
    <Fo3dErrorBoundary boundaryName="fo3d">
      <Leva />
      <Container onMouseOver={update} onMouseMove={update} data-cy="looker3d">
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
    </Fo3dErrorBoundary>
  );
};
