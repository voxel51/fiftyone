import React from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

export default function Histogram({ data }) {
  const barHeight = 30;
  return (
    <BarChart
      width={250}
      height={data.length * barHeight}
      data={data}
      layout="vertical"
      margin={0}
    >
      <XAxis type="number" hide />
      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} />
      <Bar dataKey="count" fill="#8884d8" barSize={barHeight}>
        <LabelList dataKey="count" position="right" />
      </Bar>
    </BarChart>
  );
}
