import { Selector } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { is3d } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import { isEditing } from "./Edit";
import { useGroupAnnotationSlices } from "./useGroupAnnotationSlices";

const Container = styled.div`
  padding: 0 1rem 0.5rem 1.5rem;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Label = styled.div`
  color: ${({ theme }) => theme.text.secondary};
  font-size: 1rem;
  white-space: nowrap;
`;

interface SliceOptionProps {
  value: string;
  className?: string;
  isDisabled?: boolean;
  mediaType?: string;
}

interface AnnotationSliceSelectorProps {
  onSliceSelected?: () => void;
}

const SliceOption = ({ value, isDisabled, mediaType }: SliceOptionProps) => {
  return (
    <span
      style={{
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      title={
        isDisabled
          ? `${
              mediaType ? `"${mediaType}"` : "This"
            } media type does not support annotation`
          : undefined
      }
    >
      {value}
      {isDisabled && " (unsupported)"}
    </span>
  );
};

/**
 * Slice selector component for annotation mode in grouped datasets.
 * Shows a searchable dropdown of all slices, with unsupported media types disabled.
 * Auto-selects the first supported slice when mounted.
 */
export const AnnotationSliceSelector: React.FC<
  AnnotationSliceSelectorProps
> = ({ onSliceSelected }) => {
  const isEditing_ = useAtomValue(isEditing);

  const { allSlices, supportedSlices, preferredSlice, setPreferredSlice } =
    useGroupAnnotationSlices();

  const modalGroupSlice = useRecoilValue(fos.modalGroupSlice);
  const setModalGroupSlice = useSetRecoilState(fos.modalGroupSlice);

  const groupMediaTypesMap = useRecoilValue(fos.groupMediaTypesMap);
  const set3dVisible = useSetRecoilState(fos.groupMedia3dVisibleSetting);
  const setMainVisible = useSetRecoilState(fos.groupMediaIsMainVisibleSetting);
  const setCarouselVisible = useSetRecoilState(
    fos.groupMediaIsCarouselVisibleSetting
  );

  const setIs3dSlicePinned = useSetRecoilState(fos.pinned3d);
  const setPinned3DSampleSliceName = useSetRecoilState(fos.pinned3DSampleSlice);
  const setAllActive3dSlices = useSetRecoilState(fos.active3dSlices);

  // Determine the effective slice to use:
  // 1. If preferred slice is valid and supported, use it
  // 2. Otherwise fall back to modalGroupSlice if it's supported
  // 3. Otherwise use first supported slice
  const effectiveSlice = useMemo(() => {
    if (preferredSlice && supportedSlices.includes(preferredSlice)) {
      return preferredSlice;
    }
    if (modalGroupSlice && supportedSlices.includes(modalGroupSlice)) {
      return modalGroupSlice;
    }

    return supportedSlices.length > 0 ? supportedSlices[0] : null;
  }, [preferredSlice, modalGroupSlice, supportedSlices]);

  const applyVisibilityForSlice = useCallback(
    (sliceName: string) => {
      const mediaType = groupMediaTypesMap[sliceName];
      const isThreeD = mediaType ? is3d(mediaType) : false;

      if (isThreeD) {
        set3dVisible(true);
        setMainVisible(false);
        setCarouselVisible(false);

        setIs3dSlicePinned(true);
        setPinned3DSampleSliceName(sliceName);
        setAllActive3dSlices((prev) =>
          Array.from(new Set([sliceName, ...prev]))
        );
      } else {
        setMainVisible(true);
        set3dVisible(false);
        setCarouselVisible(false);
        // Unpin 3D so activeModalSample returns modalSample data
        setIs3dSlicePinned(false);
      }
    },
    [groupMediaTypesMap]
  );

  // This effect syncs slice state whenever effectiveSlice changes
  useEffect(() => {
    if (effectiveSlice) {
      setPreferredSlice(effectiveSlice);
      setModalGroupSlice(effectiveSlice);
      applyVisibilityForSlice(effectiveSlice);
      onSliceSelected?.();
    }
  }, [effectiveSlice, onSliceSelected, applyVisibilityForSlice]);

  const useSearch = useCallback(
    (search: string) => {
      const values = allSlices
        .filter((slice) =>
          slice.name.toLowerCase().includes(search.toLowerCase())
        )
        .map((slice) => slice.name);
      return { values, total: values.length };
    },
    [allSlices]
  );

  const onSelect = useCallback(
    async (sliceName: string) => {
      const sliceInfo = allSlices.find((s) => s.name === sliceName);
      if (!sliceInfo?.isSupported) {
        // Don't allow selecting unsupported slices
        return effectiveSlice;
      }

      setPreferredSlice(sliceName);
      setModalGroupSlice(sliceName);
      applyVisibilityForSlice(sliceName);
      onSliceSelected?.();
      return sliceName;
    },
    [allSlices, effectiveSlice, applyVisibilityForSlice, onSliceSelected]
  );

  const sliceInfoMap = useMemo(
    () => Object.fromEntries(allSlices.map((s) => [s.name, s])),
    [allSlices]
  );

  const SliceOptionComponent = useMemo(
    () =>
      ({ value }: { value: string }) => {
        const info = sliceInfoMap[value];
        return (
          <SliceOption
            value={value}
            isDisabled={info && !info.isSupported}
            mediaType={info?.mediaType}
          />
        );
      },
    [sliceInfoMap]
  );

  if (isEditing_ || allSlices.length === 0) {
    return null;
  }

  return (
    <Container data-cy="annotation-slice-selector">
      <Label>Annotating Slice: </Label>
      <Selector
        inputStyle={{ height: 28, width: "100%" }}
        containerStyle={{ flex: 1 }}
        component={SliceOptionComponent}
        onSelect={onSelect}
        overflow={true}
        placeholder="Select slice..."
        useSearch={useSearch}
        value={effectiveSlice || undefined}
        cy="annotation-slice"
      />
    </Container>
  );
};
