import * as fos from "@fiftyone/state";
import { Select } from "@voxel51/voodo";
import { useReverbValue } from "@fiftyone/reverb";
import styled from "styled-components";
import usePanelLayout, { type LayoutKind } from "../layout";
import GroupSlice from "./GroupSlice";
import Sort from "./Sort";

export const Word = styled.span`
  color: ${({ theme }) => theme.text.secondary};
  font-size: 0.875rem;
  white-space: nowrap;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
`;

const FieldSelect = ({
  onChange,
  paths,
  value,
}: {
  onChange: (path: string) => void;
  paths: string[];
  value: string;
}) => (
  <Select
    exclusive
    portal
    value={value}
    options={paths.map((path) => ({ id: path, data: { label: path } }))}
    onChange={(v) => typeof v === "string" && onChange(v)}
    style={{ minWidth: 120 }}
  />
);

const LayoutSelect = () => {
  const { groupsAvailable, layout, paths, update } = usePanelLayout();
  const options: { id: LayoutKind; data: { label: string } }[] = [
    { id: "grid", data: { label: "Grid" } },
    ...(groupsAvailable
      ? [{ id: "groups" as const, data: { label: "Groups" } }]
      : []),
    { id: "strip", data: { label: "Strip" } },
    ...(paths.length
      ? [
          { id: "lanes" as const, data: { label: "Lanes" } },
          { id: "matrix" as const, data: { label: "Matrix" } },
        ]
      : []),
  ];

  return (
    <Select
      exclusive
      portal
      value={layout}
      options={options}
      onChange={(v) =>
        typeof v === "string" && update({ layout: v as LayoutKind })
      }
      style={{ minWidth: 104 }}
    />
  );
};

/** `by [field]` for Lanes, `[row] × [col]` for Matrix. */
const LayoutFields = () => {
  const { colField, laneField, layout, paths, rowField, update } =
    usePanelLayout();

  if (layout === "lanes") {
    return (
      <>
        <Word>by</Word>
        <FieldSelect
          paths={paths}
          value={laneField}
          onChange={(path) => update({ laneField: path })}
        />
      </>
    );
  }

  if (layout === "matrix") {
    return (
      <>
        <FieldSelect
          paths={paths}
          value={rowField}
          onChange={(path) => update({ rowField: path })}
        />
        <Word>×</Word>
        <FieldSelect
          paths={paths}
          value={colField}
          onChange={(path) => update({ colField: path })}
        />
      </>
    );
  }

  return null;
};

const Sentence = () => {
  const isGroup = useReverbValue(fos.isGroup);
  const slices = useReverbValue(fos.groupSlices);

  return (
    <Row>
      <LayoutSelect />
      <LayoutFields />
      {isGroup && slices.length > 1 && (
        <>
          <Word>of</Word>
          <GroupSlice />
        </>
      )}
      <Sort prefix={<Word>sorted by</Word>} />
    </Row>
  );
};

export default Sentence;
