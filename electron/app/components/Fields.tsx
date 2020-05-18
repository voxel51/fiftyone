import React, { useState, useEffect, useRef, PureComponent } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { Header, Loader, Segment } from "semantic-ui-react";

import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

class CustomizedAxisTick extends PureComponent {
  render() {
    const { x, y, stroke, payload } = this.props;

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="end"
          fill="#666"
          transform="rotate(-80)"
        >
          {payload.value}
        </text>
      </g>
    );
  }
}

const Histogram = connect(({ data, name }) => {
  const barWidth = 30;
  const [rightMargin, setRightMargin] = useState(0);
  const container = useRef(null);

  return (
    <Segment style={{ overflowY: "auto" }}>
      <Header as="h3">{name}</Header>
      <BarChart
        ref={container}
        height={500}
        width={data.length * (barWidth + 20)}
        barCategoryGap={"20px"}
        data={data}
        margin={{ top: 0, left: 0, bottom: 0, right: rightMargin + 5 }}
      >
        <XAxis
          dataKey="label"
          type="category"
          interval={0}
          height={150}
          axisLine={false}
          tick={<CustomizedAxisTick />}
        />
        <YAxis dataKey="count" axisLine={false} />
        <Bar dataKey="count" fill="rgb(255, 109, 4)" barSize={barWidth} />
      </BarChart>
    </Segment>
  );
});

const Charts = (props) => {
  const { state, port } = props;
  const hasDataset = Boolean(state && state.dataset);
  const socket = getSocket(port, "state");
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  const getData = () => {
    socket.emit("get_label_distributions", "", (data) => {
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
    return <Loader />;
  }
  return (
    <>
      {data.map((chart) => {
        return <Histogram data={chart.labels} name={chart._id} />;
      })}
    </>
  );
};

export default connect(Charts);
