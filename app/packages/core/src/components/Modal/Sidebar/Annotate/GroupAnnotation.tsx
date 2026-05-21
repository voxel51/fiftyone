import { Selector } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useRecoilState } from "recoil";
import styled from "styled-components";
import { isEditing } from "./Edit";
import { useApplyAnnotationSliceVisibility } from "./useApplyAnnotationSliceVisibility";
import type { AnnotationSliceInfo } from "./useGroupAnnotationSlices";
import { useGroupAnnotationSlices } from "./useGroupAnnotationSlices";

const Container = styled.div`
  padding: 0 1rem 0.5rem 1.5rem;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const sliceOptionTitle = ({
  isSupported,
  isMissing,
  mediaType,
}: AnnotationSliceInfo) => {
  if (!isSupported) {
    return `${
      mediaType ? `"${mediaType}"` : "This"
    } media type does not support annotation`;
  }
  if (isMissing) {
    return "slice does not exist on this group";
  }
  return undefined;
};

const sliceOptionSuffix = ({ isSupported, isMissing }: AnnotationSliceInfo) => {
  if (!isSupported) return " (unsupported)";
  if (isMissing) return " (missing)";
  return null;
};

const SliceOption = ({ info }: { info: AnnotationSliceInfo }) => {
  const isDisabled = info.isMissing || !info.isSupported;
  return (
    <span
      style={{
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      title={sliceOptionTitle(info)}
    >
      {info.name}
      {sliceOptionSuffix(info)}
    </span>
  );
};

interface GroupAnnotationProps {
  onSliceSelected?: () => void;
}

export default function GroupAnnotation({
  onSliceSelected,
}: GroupAnnotationProps) {
  const { resolved } = useGroupAnnotationSlices();
  const isLoading = resolved === "loading";
  const slices = isLoading ? [] : resolved;

  const isEditing_ = useAtomValue(isEditing);
  const [modalGroupSlice, setModalGroupSlice] = useRecoilState(
    fos.modalGroupSlice
  );
  const applyVisibilityForSlice = useApplyAnnotationSliceVisibility();
  const [preferredSlice, setPreferredSlice] =
    fos.usePreferredGroupAnnotationSlice();

  const sliceInfoMap = useMemo(
    () => Object.fromEntries(slices.map((s) => [s.name, s])),
    [slices]
  );

  const useSearch = useCallback(
    (search: string) => {
      const values = slices
        .filter(
          ({ name, isMissing, isSupported }) =>
            !isMissing &&
            isSupported &&
            name.toLowerCase().includes(search.toLowerCase())
        )
        .map((s) => s.name);
      return { values, total: values.length };
    },
    [slices]
  );

  const onSelect = useCallback(
    async (sliceName: string) => {
      const info = sliceInfoMap[sliceName];
      if (!info?.isSupported || info.isMissing) {
        return modalGroupSlice;
      }

      applyVisibilityForSlice(sliceName);
      onSliceSelected?.();
      setModalGroupSlice(sliceName);
      setPreferredSlice(sliceName);
      return sliceName;
    },
    [
      sliceInfoMap,
      applyVisibilityForSlice,
      modalGroupSlice,
      onSliceSelected,
      setModalGroupSlice,
      setPreferredSlice,
    ]
  );

  const SliceOptionComponent = useMemo(
    () =>
      ({ value }: { value: string }) =>
        <SliceOption info={sliceInfoMap[value]} />,
    [sliceInfoMap]
  );

  if (isEditing_ || (!isLoading && slices.length === 0)) {
    return null;
  }

  return (
    <Container data-cy="annotation-slice-selector">
      <Selector
        inputStyle={{ height: 28, width: "100%" }}
        containerStyle={{ flex: 1 }}
        component={SliceOptionComponent}
        onSelect={onSelect}
        overflow={true}
        placeholder={isLoading ? "Loading..." : "Select slice..."}
        useSearch={useSearch}
        resultsPlacement="bottom-start"
        value={isLoading ? null : preferredSlice}
        cy="annotation-slice"
      />
    </Container>
  );
}
