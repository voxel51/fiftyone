import React from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

export default function Histogram({ data }) {
  return (
    <BarChart width={250} height={200} data={data} layout="vertical">
      <XAxis type="number" hide />
      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} />
      <Bar dataKey="count" fill="#8884d8">
        <LabelList dataKey="count" position="right" />
      </Bar>
    </BarChart>
  );
}
