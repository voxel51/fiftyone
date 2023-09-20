import { Loading, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { distribution } from "@fiftyone/state";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  scrollbarStyles,
} from "@fiftyone/utilities";
import React, { PureComponent, Suspense, useLayoutEffect } from "react";
import useMeasure from "react-use-measure";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import {
  formatDateTime,
  getDateTimeRangeFormattersWithPrecision,
  isFloat,
  prettify,
} from "../utils/generic";
import { ContentDiv, ContentHeader } from "./utils";

const Container = styled.div`
  ${scrollbarStyles}
  overflow-y: hidden;
  overflow-x: auto;
  width: 100%;
  flex: 1;
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
  margin-left: 1rem;
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
      return makeData(data.counts, data.datetimes);
    case "FloatHistogramValuesResponse":
      return makeData(data.counts, data.floats);
    case "IntHistogramValuesResponse":
      return makeData(data.counts, data.ints);
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

const makeData = (counts: readonly number[], values: readonly number[]) => {
  if (counts.length < 2) {
    return { data: [], ticks: null };
  }

  const data = counts.map((count, i) => ({
    count,
    key: (values[i + 1] - values[i]) / 2 + values[i],
    edges: [values[i], values[i + 1]] as [number, number],
  }));

  return { data: data, ticks: getTicks(data) };
};

const HistogramRenderer: React.FC<{ path: string }> = ({ path }) => {
  const [ref, { height }] = useMeasure();
  const theme = useTheme();

  const { data, ticks } = useData(path);
  const hasMore = data.length >= LIMIT;

  const barWidth = 24;
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

  useLayoutEffect(() => {
    document
      .getElementById(`histogram-${path}`)
      ?.dispatchEvent(new CustomEvent(`histogram-${path}`, { bubbles: true }));
  }, [path, ref]);

  return data.length ? (
    <Container id={`histogram-${path}`} ref={ref}>
      {hasMore && <Title>{`First ${data?.length} results`}</Title>}
      <BarChart
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
          isAnimationActive={false}
        />
      </BarChart>
    </Container>
  ) : (
    <Loading>No Data</Loading>
  );
};

const Distribution = ({ path }: { path: string }) => {
  return (
    <Suspense fallback={<Loading ellipsisAnimation>Loading</Loading>}>
      <HistogramRenderer key={path} path={path} />
    </Suspense>
  );
};

export default Distribution;
