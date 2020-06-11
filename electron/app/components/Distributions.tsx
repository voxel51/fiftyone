import React, { useState, useEffect, useRef, PureComponent } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis, Tooltip } from "recharts";
import { Dimmer, Header, Loader, Message, Segment } from "semantic-ui-react";
import _ from "lodash";

import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";
import { isFloat } from "../utils/generic";

class CustomizedAxisTick extends PureComponent {
  render() {
    const { x, y, stroke, payload, fill } = this.props;
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

const Distribution = connect(({ distribution }) => {
  const { name, type, data } = distribution;
  const barWidth = 30;
  const [rightMargin, setRightMargin] = useState(0);
  const container = useRef(null);
  const stroke = "hsl(210, 20%, 90%)";
  const fill = stroke;
  const isNumeric = _.indexOf(["int", "float"], type) >= 0;
  const padding = isNumeric ? 0 : 20;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "1rem",
        overflow: "hidden",
      }}
    >
      <Segment style={{ overflowY: "overlay" }}>
        <Header as="h3">{`${name}: ${type}`}</Header>
        <BarChart
          ref={container}
          height={500}
          width={data.length * (barWidth + padding)}
          barCategoryGap={"20px"}
          data={data}
          margin={{ top: 0, left: 0, bottom: 0, right: rightMargin + 5 }}
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
      </Segment>
    </div>
  );
});

function NoDistributions({ name }) {
  return (
    <div style={{ padding: "1rem" }}>
      <Segment>
        <Message>No {name}</Message>
      </Segment>
    </div>
  );
}

const Distributions = ({ group, port, state }) => {
  const socket = getSocket(port, "state");
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

  useSubscribe(socket, "update", (data) => {
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

  if (!data.length) {
    return <NoDistributions name={group} />;
  }

  return (
    <>
      {data.map((distribution, i) => {
        return <Distribution key={i} distribution={distribution} />;
      })}
    </>
  );
};

export default connect(Distributions);
