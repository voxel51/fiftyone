import { useDismissable, useKeymapScope } from "@fiftyone/keymap";
import * as fos from "@fiftyone/state";
import { is3d, isDirect3dSamplePath, setContains3d } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as recoil from "recoil";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import { ActionBar } from "./action-bar";
import { Container } from "./containers";
import { Fo3dErrorBoundary } from "./ErrorBoundary";
import { Leva } from "./fo3d/Leva";
import { MediaTypeFo3dComponent } from "./fo3d/MediaTypeFo3d";
import { getMediaPathForFo3dSample } from "./fo3d/utils";
import { useHotkey } from "./hooks";
import { getLooker3dRenderKey } from "./looker3d-render-key";
import {
  currentActionAtom,
  fo3dContainsBackground,
  isColormapModalOpenAtom,
  isGridOnAtom,
  isLevaConfigPanelOnAtom,
} from "./state";

/**
 * This component renders all supported 3D contexts through the FO3D pipeline,
 * including legacy point-cloud media types.
 */
export const Looker3d = () => {
  const mediaType = useRecoilValue(fos.mediaType);
  const has3dSlices = setContains3d(useRecoilValue(fos.groupMediaTypesSet));
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);
  const isGroup = useRecoilValue(fos.isGroup);
  const modalMode = fos.useModalMode();
  const isMain2DViewerVisible = useRecoilValue(
    fos.groupMediaIsMain2DViewerVisible,
  );
  const parentMediaType = useRecoilValue(fos.parentMediaTypeSelector);
  const sample = fos.useStableSceneSample3d();
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const mediaPath = useMemo(
    () => (sample ? getMediaPathForFo3dSample(sample, mediaField) : null),
    [sample, mediaField],
  );
  const hasDirect3dPath = useMemo(
    () =>
      Boolean(
        mediaPath &&
        (isDirect3dSamplePath(mediaPath) ||
          isDirect3dSamplePath(sample?.sample?.filepath)),
      ),
    [mediaPath, sample],
  );

  const [isHovering, setIsHovering] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);
  const hoveringRef = useRef(false);

  const setCurrentAction = useSetRecoilState(currentActionAtom);

  const setFo3dHasBackground = useSetRecoilState(fo3dContainsBackground);

  const thisSampleId = useRecoilValue(fos.modalSampleId);

  // test affordance: 3D selection has no DOM signal, so expose its count
  const selectedLabelCount = useRecoilValue(fos.selectedLabels).length;

  useEffect(() => {
    return () => {
      setFo3dHasBackground(false);
    };
  }, [setFo3dHasBackground]);

  const shouldRenderFo3dComponent = useMemo(
    () =>
      is3d(mediaType) ||
      hasDirect3dPath ||
      (mediaType === "group" && has3dSlices) ||
      (isDynamicGroup && is3d(parentMediaType)),
    [mediaType, hasDirect3dPath, has3dSlices, isDynamicGroup, parentMediaType],
  );

  const sampleMap = fos.useStableActive3dSamplesMap();
  const activeFo3dSlice = fos.useStableActiveFo3dSlice();
  const renderContext =
    modalMode === fos.ModalMode.ANNOTATE && !(isGroup && isMain2DViewerVisible)
      ? "annotate-focused"
      : "default";

  const looker3dSceneKey = getLooker3dRenderKey({
    modalSampleId: thisSampleId,
    activeFo3dSlice,
    renderContext,
  });

  useHotkey(
    "fo.modal.3d.grid.toggle",
    async ({ set }) => {
      set(isGridOnAtom, (prev) => !prev);
    },
    [],
  );

  // The 3D Escape ladder, moved onto the dismissal stack (§4.6).
  //
  // It was already a ladder — a single handler whose sequential early returns
  // each meant "I consumed this Escape" — it just had no way to say so to the
  // other ~19 Escape handlers in the app, which all ran anyway. Each `return`
  // is now `return true` and the final fall-through is `return false`, so this
  // interoperates with the modal, popouts and grid instead of racing them.
  //
  // Kept as one dismisser rather than split per owner: the ordering below is
  // load-bearing and undocumented, and decomposing it into per-component
  // layers is a behavior change that does not belong inside a migration.
  const dismiss3d = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const read = <T,>(atom: recoil.RecoilValue<T>) =>
          snapshot.getLoadable(atom).valueMaybe();

        if (read(fos.isTooltipLocked)) {
          set(fos.isTooltipLocked, false);
          return true;
        }

        if (read(isColormapModalOpenAtom)) {
          set(isColormapModalOpenAtom, false);
          return true;
        }

        if (read(isLevaConfigPanelOnAtom)) {
          set(isLevaConfigPanelOnAtom, false);
          return true;
        }

        if (read(currentActionAtom)) {
          set(currentActionAtom, null);
          return true;
        }

        const panels = read(fos.lookerPanels);
        for (const panel of ["help", "json"]) {
          if (panels?.[panel]?.isOpen) {
            set(fos.lookerPanels, {
              ...panels,
              [panel]: { ...panels[panel], isOpen: false },
            });
            return true;
          }
        }

        // Declines when the hovered sample belongs to a 2D looker, so that
        // looker gets the Escape instead. Previously this `return` was
        // indistinguishable from the consuming ones.
        const hovered = read(fos.hoveredSample);
        if (
          hovered &&
          !Object.values(sampleMap).find((s) => s.sample._id === hovered._id)
        ) {
          return false;
        }

        if (read(fos.fullscreen)) {
          set(fos.fullscreen, false);
          return true;
        }

        const selectedLabels = read(fos.selectedLabels);
        if (selectedLabels && selectedLabels.length > 0) {
          set(fos.selectedLabelMap, {});
          return true;
        }

        set(fos.hiddenLabels, {});
        set(fos.modalSelector, null);
        return true;
      },
    [sampleMap, isHovering],
  );

  useKeymapScope("modal.3d");
  useDismissable("looker-3d", "3D viewer", "modal.3d", dismiss3d);

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

  if (!sample) return null;

  if (!shouldRenderFo3dComponent) {
    return <div>Unsupported media type: {mediaType}</div>;
  }

  return (
    <Fo3dErrorBoundary key={looker3dSceneKey} boundaryName="fo3d">
      <Leva />
      <Container
        onMouseOver={update}
        onMouseMove={update}
        data-cy="looker3d"
        data-cy-selected-label-count={selectedLabelCount}
      >
        <MediaTypeFo3dComponent key={looker3dSceneKey} />
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
