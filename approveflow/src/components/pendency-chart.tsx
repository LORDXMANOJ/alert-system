"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type PendencyRow = { stage: string; open: number; overdue: number };

/** Stage-wise pendency: open and overdue applications per configured stage. */
export function PendencyChart({ data }: { data: PendencyRow[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Open and overdue applications by stage">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#9fd8ba" />
          <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#4d2a45" }} tickLine={false} axisLine={{ stroke: "#4f8f70" }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#4d2a45" }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "#aee8c8" }}
            contentStyle={{ borderRadius: 8, borderColor: "#9fd8ba", fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="open" name="Open" fill="#824670" radius={[4, 4, 0, 0]} />
          <Bar dataKey="overdue" name="Overdue" fill="#b8244f" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
