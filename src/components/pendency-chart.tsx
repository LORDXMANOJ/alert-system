"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type PendencyRow = { stage: string; open: number; overdue: number };

/** Stage-wise pendency: open and overdue applications per configured stage. */
export function PendencyChart({ data }: { data: PendencyRow[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Open and overdue applications by stage">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#d3d5ae" />
          <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#3a3820" }} tickLine={false} axisLine={{ stroke: "#7f8157" }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#3a3820" }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "#e6e8c6" }}
            contentStyle={{ borderRadius: 8, borderColor: "#d3d5ae", fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="open" name="Open" fill="#083D77" radius={[4, 4, 0, 0]} />
          <Bar dataKey="overdue" name="Overdue" fill="#b4232c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
