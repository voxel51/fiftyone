import React, { useState, useRef, PureComponent, useEffect } from "react";
import { Bar, BarChart, XAxis, YAxis, Tooltip } from "recharts";
import { selectorFamily, useRecoilValue } from "recoil";
import styled from "styled-components";
import useMeasure from "react-use-measure";
import { scrollbarStyles } from "./utils";

import Loading from "./Loading";
import { ContentDiv, ContentHeader } from "./utils";
import {
  formatDateTime,
  getDateTimeRangeFormattersWithPrecision,
  isFloat,
  prettify,
} from "../utils/generic";
import { useMessageHandler, useSendMessage } from "../utils/hooks";
import * as selectors from "../recoil/selectors";
import { filterStages } from "./Filters/atoms";
import { LIST_LIMIT } from "./Filters/StringFieldFilter.state";
import {
  isDateField,
  isDateTimeField,
} from "./Filters/NumericFieldFilter.state";

const Container = styled.div`
  ${scrollbarStyles}
  overflow-y: hidden;
  overflow-x: scroll;
  width: 100%;
  height: 100%;
  padding-left: 1rem;
`;

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
            {isDateTime
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

const Distribution = ({ distribution }) => {
  const { name, data, ticks, type } = distribution;
  const [ref, { height }] = useMeasure();
  const barWidth = 24;
  const container = useRef(null);
  const stroke = "hsl(210, 20%, 90%)";
  const fill = stroke;
  const isDateTime = useRecoilValue(isDateTimeField(name));
  const isDate = useRecoilValue(isDateField(name));
  const timeZone = useRecoilValue(selectors.timeZone);
  const ticksSetting =
    ticks === 0
      ? { interval: ticks }
      : {
          ticks,
        };

  const strData = data.map(({ key, ...rest }) => ({
    ...rest,
    key: isDateTime || isDate ? key : prettify(key, false),
  }));

  const hasMore = data.length >= LIST_LIMIT;

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
    <Container ref={ref}>
      <Title>{`${name}${hasMore ? ` (first ${data.length})` : ""}`}</Title>
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
                const [{ $date: start }, { $date: end }] = map[key];
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
                  .map((e) => (type === "IntField" ? e : e.toFixed(3)))
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
  );
};

const DistributionsContainer = styled.div`
  overflow-y: scroll;
  overflow-x: hidden;
  width: 100%;
  height: calc(100% - 3rem);
  ${scrollbarStyles}
`;

const Distributions = ({ group }: { group: string }) => {
  const view = useRecoilValue(selectors.view);
  const filters = useRecoilValue(filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const [loading, setLoading] = useState(true);
  const refresh = useRecoilValue(selectors.refresh);
  const [data, setData] = useState([]);

  useSendMessage("distributions", { group: group.toLowerCase() }, null, [
    JSON.stringify(view),
    JSON.stringify(filters),
    datasetName,
    refresh,
  ]);

  useMessageHandler("distributions", ({ results }) => {
    setLoading(false);
    setData(results);
  });

  useEffect(() => {
    setData([]);
    setLoading(true);
  }, [
    JSON.stringify(view),
    JSON.stringify(filters),
    datasetName,
    refresh,
    group,
  ]);

  if (loading) {
    return <Loading />;
  }

  if (data.length === 0) {
    return <Loading text={`No ${group.toLowerCase()}`} />;
  }

  return (
    <DistributionsContainer>
      {data.map((distribution, i) => {
        return <Distribution key={i} distribution={distribution} />;
      })}
    </DistributionsContainer>
  );
};

export default Distributions;
