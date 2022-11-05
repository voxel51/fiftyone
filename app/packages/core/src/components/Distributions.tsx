import React, { useRef, PureComponent, Suspense, useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis, Tooltip } from "recharts";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import useMeasure from "react-use-measure";
import { scrollbarStyles } from "./utils";

import { ContentDiv, ContentHeader } from "./utils";
import {
  formatDateTime,
  getDateTimeRangeFormattersWithPrecision,
  isFloat,
  prettify,
} from "../utils/generic";

import * as fos from "@fiftyone/state";
import { DATE_FIELD, DATE_TIME_FIELD } from "@fiftyone/utilities";
import {
  distribution,
  distributionPaths,
  noDistributionPathsData,
} from "@fiftyone/state";
import { useTheme, Loading } from "@fiftyone/components";

const Container = styled.div`
  ${scrollbarStyles}
  overflow-y: hidden;
  overflow-x: scroll;
  width: 100%;
  height: 100%;
  padding-left: 1rem;
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

const DistributionRenderer: React.FC<{ path: string; height: number }> = ({
  path,
  height,
}) => {
  const theme = useTheme();
  const { values } = useRecoilValue(distribution(path));

  if (!values) {
    throw new Error("invalid");
  }

  const data = useMemo(() => {
    return values.map((value) => {
      return {
        count: value.count,
        edges: value.min !== undefined ? [value.min, value.max] : undefined,
        key:
          value.min !== undefined
            ? (value.max - value.min) / 2 + value.min
            : value.value,
      };
    });
  }, [values]);

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

  return (
    <BarChart
      ref={container}
      height={height - 37}
      width={values.length * (barWidth + 4) + 50}
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
              const [{ datetime: start }, { datetime: end }] = map[key];
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
  );
};

const Distribution: React.FC<{ path: string }> = ({ path }) => {
  const { values } = useRecoilValue(distribution(path));
  const hasMore = values ? values.length >= LIMIT : false;
  const [ref, { height }] = useMeasure();
  return values && values.length ? (
    <Container ref={ref}>
      <Title>{`${path}${hasMore ? ` (first ${values?.length})` : ""}`}</Title>

      <DistributionRenderer path={path} height={height} />
    </Container>
  ) : null;
};

const DistributionsContainer = styled.div`
  overflow-y: scroll;
  overflow-x: hidden;
  width: 100%;
  height: calc(100% - 3rem);
  ${scrollbarStyles}
`;

const Distributions = ({ group }: { group: string }) => {
  const paths = useRecoilValue(distributionPaths(group));
  const noData = useRecoilValue(noDistributionPathsData(group));

  return (
    <DistributionsContainer>
      {paths.map((path) => {
        return (
          <Suspense fallback={<Loading>Loading...</Loading>}>
            <Distribution key={path} path={path} />
          </Suspense>
        );
      })}
      {noData && <Loading>No data</Loading>}
    </DistributionsContainer>
  );
};

export default Distributions;
