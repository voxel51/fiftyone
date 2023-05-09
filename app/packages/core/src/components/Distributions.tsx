import React, { PureComponent, Suspense, useRef } from "react";
import useMeasure from "react-use-measure";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";
import { scrollbarStyles } from "@fiftyone/utilities";

import {
  formatDateTime,
  getDateTimeRangeFormattersWithPrecision,
  isFloat,
  prettify,
} from "../utils/generic";
import { ContentDiv, ContentHeader } from "./utils";

import { Loading, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  distribution,
  distributionPaths,
  noDistributionPathsData,
} from "@fiftyone/state";
import { DATE_FIELD, DATE_TIME_FIELD } from "@fiftyone/utilities";

const Container = styled.div`
  ${scrollbarStyles}
  overflow-y: hidden;
  overflow-x: auto;
  width: 100%;
  height: 100%;
`;

const LIMIT = 200;

const PlotTooltip = ({ title, count }) => {
  return (
    <ContentDiv>
      <ContentHeader>{title}</ContentHeader>
      Count: {count}
    </ContentDiv>
  );
};

const getAxisTick = (isDateTime, timeZone) => {
  return class CustomizedAxisTick extends PureComponent {
    render() {
      const { x, y, payload, fill } = this.props;
      const v = payload.value;

      return (
        <g transform={`translate(${x},${y})`}>
          <text
            x={0}
            y={0}
            dy={16}
            textAnchor="end"
            fill={fill}
            transform="rotate(-80)"
          >
            {isDateTime && typeof v !== "string"
              ? formatDateTime(v, timeZone)
              : isFloat(v)
              ? v.toFixed(3)
              : v.length > 24
              ? v.slice(0, 21) + "..."
              : v}
          </text>
        </g>
      );
    }
  };
};

const Title = styled.div`
  font-weight: bold;
  font-size: 1rem;
  line-height: 2rem;
`;

const getTicks = (data: { key: number; edges: [number, number] }[]) => {
  const ticks: number[] = [];
  for (
    let index = 0;
    index < data.length;
    index += Math.max(Math.floor(data.length / 4), 1)
  ) {
    ticks.push(data[index].key);
  }
  return ticks;
};

const useData = (path: string) => {
  const data = useRecoilValue(distribution(path));

  switch (data.__typename) {
    case "BoolCountValuesResponse":
      return {
        data: data.values.map(({ value, bool }) => ({
          key: bool,
          count: value,
          ticks: null,
        })),
        ticks: null,
      };
    case "DatetimeHistogramValuesResponse":
      const datetimes = data.counts.map((count, i) => ({
        count,
        key:
          (data.datetimes[i + 1] - data.datetimes[i]) / 2 + data.datetimes[i],
        edges: [data.datetimes[i], data.datetimes[i + 1]],
      }));

      return data.counts.length > 1
        ? { data: datetimes, ticks: getTicks(datetimes) }
        : { data: [], ticks: null };
    case "FloatHistogramValuesResponse":
      const floats = data.counts.map((count, i) => ({
        count: count,
        key: (data.floats[i + 1] - data.floats[i]) / 2 + data.floats[i],
        edges: [data.floats[i], data.floats[i + 1]],
      }));

      return data.counts.length > 1
        ? { data: floats, ticks: getTicks(floats) }
        : { data: [], ticks: null };
    case "IntHistogramValuesResponse":
      const ints = data.counts.map((count, i) => ({
        count,
        key: (data.ints[i + 1] - data.ints[i]) / 2 + data.ints[i],
        edges: [data.ints[i], data.ints[i + 1]],
      }));
      return data.counts.length > 1
        ? { data: ints, ticks: getTicks(ints) }
        : { data: [], ticks: null };
    case "StrCountValuesResponse":
      return {
        data: data.values.map(({ value, str }) => ({
          key: str,
          count: value,
        })),
        ticks: null,
      };

    default:
      throw new Error("invalid");
  }
};

const DistributionRenderer: React.FC<{ path: string }> = ({ path }) => {
  const [ref, { height }] = useMeasure();
  const theme = useTheme();

  const { data, ticks } = useData(path);
  const hasMore = data.length >= LIMIT;

  const barWidth = 24;
  const container = useRef(null);
  const stroke = theme.text.secondary;
  const fill = stroke;
  const isDateTime = useRecoilValue(
    fos.meetsType({ path, ftype: DATE_TIME_FIELD })
  );
  const isDate = useRecoilValue(fos.meetsType({ path, ftype: DATE_FIELD }));
  const timeZone = useRecoilValue(fos.timeZone);

  const strData = data.map(({ key, ...rest }) => ({
    ...rest,
    key: isDateTime || isDate ? key : prettify(key),
  }));

  const map = strData.reduce(
    (acc, cur) => ({
      ...acc,
      [cur.key]: cur.edges,
    }),
    {}
  );

  const CustomizedAxisTick = getAxisTick(
    isDateTime || isDate,
    isDate ? "UTC" : timeZone
  );
  const ticksSetting =
    ticks === null
      ? { interval: 0 }
      : {
          ticks,
        };

  return data.length ? (
    <Container ref={ref}>
      <Title>{`${path}${hasMore ? ` (first ${data?.length})` : ""}`}</Title>
      <BarChart
        ref={container}
        height={height - 37}
        width={data.length * (barWidth + 4) + 50}
        barCategoryGap={"4px"}
        data={strData}
        margin={{ top: 0, left: 0, bottom: 5, right: 5 }}
      >
        <XAxis
          dataKey="key"
          height={0.2 * height}
          axisLine={false}
          tick={<CustomizedAxisTick {...{ fill }} />}
          tickLine={{ stroke }}
          {...ticksSetting}
        />
        <YAxis
          dataKey="count"
          axisLine={false}
          tick={{ fill }}
          tickLine={{ stroke }}
        />
        <Tooltip
          cursor={false}
          content={(point) => {
            const key = point?.payload[0]?.payload?.key;
            const count = point?.payload[0]?.payload?.count;
            if (typeof count !== "number") return null;

            let title = `Value: ${key}`;

            if (map[key]) {
              if (isDateTime || isDate) {
                const [start, end] = map[key];
                const [cFmt, dFmt] = getDateTimeRangeFormattersWithPrecision(
                  isDate ? "UTC" : timeZone,
                  start,
                  end
                );
                let range = dFmt.formatRange(start, end).replaceAll("/", "-");

                if (dFmt.resolvedOptions().fractionalSecondDigits === 3) {
                  range = range.replaceAll(",", ".");
                }
                title = `Range: ${
                  cFmt ? cFmt.format(start).replaceAll("/", "-") : ""
                } ${range.replaceAll("/", "-")}`;
              } else {
                title = `Range: [${map[key]
                  .map((e) => (Number.isInteger(e) ? e : e.toFixed(3)))
                  .join(", ")})`;
              }
            }

            return <PlotTooltip title={title} count={count} />;
          }}
          contentStyle={{
            background: "hsl(210, 20%, 23%)",
            borderColor: "rgb(255, 109, 4)",
          }}
        />
        <Bar
          dataKey="count"
          fill="rgb(255, 109, 4)"
          barCategoryGap={0}
          barSize={barWidth}
        />
      </BarChart>
    </Container>
  ) : null;
};

const DistributionsContainer = styled.div`
  overflow-y: scroll;
  overflow-x: hidden;
  width: 100%;
  height: calc(100% - 4.5rem);
  ${scrollbarStyles}
`;

const Distributions = ({
  group,
  style,
}: {
  group: string;
  style?: React.CSSProperties;
}) => {
  const paths = useRecoilValue(distributionPaths(group));
  const noData = useRecoilValueLoadable(noDistributionPathsData(group));

  if (noData.state === "hasError") throw noData.contents;
  return noData.state === "hasValue" ? (
    !noData.contents ? (
      <Suspense fallback={<Loading ellipsisAnimation>Loading</Loading>}>
        <DistributionsContainer style={style}>
          {paths.map((path) => {
            return <DistributionRenderer key={path} path={path} />;
          })}
        </DistributionsContainer>
      </Suspense>
    ) : (
      <Loading>No data</Loading>
    )
  ) : (
    <Loading ellipsisAnimation>Loading</Loading>
  );
};

export default Distributions;
