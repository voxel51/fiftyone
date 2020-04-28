import React, { useState, useEffect, useRef } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

export default function Histogram({ data }) {
  const barHeight = 30;
  const [rightMargin, setRightMargin] = useState(0);
  const container = useRef(null);

  useEffect(() => {
    if (container.current && container.current.container) {
      const nodes = container.current.container.querySelectorAll(
        "text.recharts-label"
      );
      if (nodes.length) {
        const rects = Array.from(nodes).map((node) =>
          node.getBoundingClientRect()
        );
        const rightmost = rects.sort((n1, n2) => n2.right - n1.right)[0];
        setRightMargin(rightmost.width);
      }
    }
  }, [container.current, data]);

  return (
    <BarChart
      ref={container}
      width={350}
      height={data.length * barHeight}
      data={data}
      layout="vertical"
      margin={{ top: 0, left: 0, bottom: 0, right: rightMargin + 5 }}
    >
      <XAxis type="number" hide />
      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} />
      <Bar dataKey="count" fill="#8884d8" barSize={barHeight}>
        <LabelList dataKey="count" position="right" />
      </Bar>
    </BarChart>
  );
}
