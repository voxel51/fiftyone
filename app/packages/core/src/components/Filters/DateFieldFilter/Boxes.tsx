import { pathColor } from "@fiftyone/state";
import React from "react";
import type { RecoilState } from "recoil";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { DatePicker } from "@fiftyone/components";
import * as fou from "@fiftyone/utilities";
import * as fos from "@fiftyone/state";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  column-gap: 1rem;
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;s
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const Box = ({
  rangeAtom,
  boundsAtom,
  color,
  label,
  isDateTime,
  isMin,
}: {
  rangeAtom: RecoilState<fos.Range>;
  boundsAtom: RecoilState<fos.Range>;
  color: string;
  label: string;
  isDateTime: boolean;
  isMin: boolean;
}) => {
  const [range, setRange] = useRecoilState(rangeAtom);
  const [bounds] = useRecoilState(boundsAtom);
  const timeZone = useRecoilValue(fos.timeZone);
  console.log(timeZone);
  const index = isMin ? 0 : 1;
  console.log(dayjs(range[0]).tz(timeZone));
  return (
    <DatePicker
      color={color}
      label={label}
      value={dayjs(range[index]).tz(timeZone)}
      minDate={dayjs(isMin ? bounds[0] : range[0]).tz(timeZone)}
      maxDate={dayjs(isMin ? range[1] : bounds[1]).tz(timeZone)}
      onChange={(v) => {
        if (dayjs.isDayjs(v) && v.isValid()) {
          console.log(v);
          const newRange = [...range];
          newRange[index] = v?.valueOf();
          setRange(newRange as fos.Range);
        }
      }}
      isDateTime={isDateTime}
    />
  );
};

const Boxes = ({ path, modal }: { path: string; modal: boolean }) => {
  const color = useRecoilValue(pathColor(path));
  const ftype = useRecoilValue(fos.fieldType({ path }));
  const isDateTime = ftype === fou.DATE_TIME_FIELD;
  const range = fos.rangeAtom({
    modal,
    path,
    withBounds: true,
  });
  const bounds = fos.boundsAtom({
    path,
    modal,
  });
  return (
    <Container>
      <Box
        rangeAtom={range}
        boundsAtom={bounds}
        color={color}
        label={"Start"}
        isDateTime={isDateTime}
        isMin={true}
      />
      <Box
        rangeAtom={range}
        boundsAtom={bounds}
        color={color}
        label={"End"}
        isDateTime={isDateTime}
        isMin={false}
      />
    </Container>
  );
};

export default Boxes;
