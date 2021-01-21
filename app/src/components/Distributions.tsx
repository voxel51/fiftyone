import React, { useState, useRef, PureComponent, useEffect } from "react";
import { Bar, BarChart, XAxis, YAxis, Tooltip } from "recharts";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import useMeasure from "react-use-measure";
import _ from "lodash";
import { scrollbarStyles } from "./utils";

import Loading from "./Loading";
import { isFloat } from "../utils/generic";
import { useMessageHandler, useSendMessage } from "../utils/hooks";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const Container = styled.div`
  ${scrollbarStyles}
  overflow-y: hidden;
  overflow-x: scroll;
  width: 100%;
  height: 100%;
  padding-left: 1rem;
`;

class CustomizedAxisTick extends PureComponent {
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
          {isFloat(v)
            ? v.toFixed(3)
            : v.length > 24
            ? v.slice(0, 21) + "..."
            : v}
        </text>
      </g>
    );
  }
}

const Title = styled.div`
  font-weight: bold;
  font-size: 1rem;
  line-height: 2rem;
`;

const Distribution = ({ distribution }) => {
  const { name, data, ticks } = distribution;
  const [ref, { height }] = useMeasure();
  const barWidth = 24;
  const container = useRef(null);
  const stroke = "hsl(210, 20%, 90%)";
  const fill = stroke;
  const ticksSetting =
    ticks === 0
      ? { interval: ticks }
      : {
          ticks,
        };
  const map = data.reduce(
    (acc, cur) => ({
      [cur.key]: cur.edges,
      ...acc,
    }),
    {}
  );
  console.log(map);

  return (
    <Container ref={ref}>
      <Title>{`${name}`}</Title>
      <BarChart
        ref={container}
        height={height - 37}
        width={data.length * (barWidth + 4) + 50}
        barCategoryGap={"4px"}
        data={data}
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
            console.log(key);
            if (map[key]) {
              return `[${map[key].map((e) => e.toFixed(3)).join(", ")})`;
            }
            return "hello";
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

const Distributions = ({ group }) => {
  const view = useRecoilValue(selectors.view);
  const filters = useRecoilValue(selectors.filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const [loading, setLoading] = useState(true);
  const refresh = useRecoilValue(atoms.refresh);
  const [data, setData] = useState([]);

  useSendMessage("distributions", { group }, null, [
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
  }, [JSON.stringify(view), JSON.stringify(filters), datasetName, refresh]);

  if (loading) {
    return <Loading />;
  }

  if (data.length === 0) {
    return <Loading text={`No ${group}`} />;
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
