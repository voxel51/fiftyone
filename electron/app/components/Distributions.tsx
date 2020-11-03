import React, { useState, useRef, PureComponent } from "react";
import { Bar, BarChart, XAxis, YAxis, Tooltip } from "recharts";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { Dimmer, Header, Loader, Message } from "semantic-ui-react";
import _ from "lodash";
import { scrollbarStyles } from "./utils";

import { useSubscribe } from "../utils/socket";
import { isFloat } from "../utils/generic";
import * as selectors from "../recoil/selectors";

const Container = styled.div`
  ${scrollbarStyles}
  overflow-y: hidden;
  overflow-x: scroll;
  width: 100%;
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
          {isFloat(v) ? v.toFixed(3) : v}
        </text>
      </g>
    );
  }
}

const Title = styled.div`
  font-weight: bold;
  font-size: 1rem;
`;

const Distribution = ({ distribution }) => {
  const { name, type, data } = distribution;
  const barWidth = 30;
  const container = useRef(null);
  const stroke = "hsl(210, 20%, 90%)";
  const fill = stroke;
  const isNumeric = _.indexOf(["int", "float"], type) >= 0;
  const padding = isNumeric ? 0 : 20;

  return (
    <Container>
      <Title>{`${name}: ${type}`}</Title>
      <BarChart
        ref={container}
        height={300}
        width={data.length * (barWidth + padding)}
        barCategoryGap={"20px"}
        data={data}
        margin={{ top: 0, left: 0, bottom: 0, right: 5 }}
      >
        <XAxis
          dataKey="key"
          type="category"
          interval={isNumeric ? "preserveStartEnd" : 0}
          height={100}
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
  padding: 1rem 0;
  overflow-y: scroll;
  overflow-x: hidden;
  width: 100%;
  height: 100%;
  ${scrollbarStyles}
`;

const Distributions = ({ group }) => {
  const socket = useRecoilValue(selectors.socket);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  const getData = () => {
    socket.emit("get_distributions", group, (data) => {
      setInitialLoad(false);
      setLoading(false);
      setData(data);
    });
  };

  if (initialLoad) {
    getData();
  }

  useSubscribe(socket, "update", () => {
    setLoading(true);
    getData();
  });

  if (loading) {
    return (
      <Dimmer active className="samples-dimmer" key={-1}>
        <Loader />
      </Dimmer>
    );
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
