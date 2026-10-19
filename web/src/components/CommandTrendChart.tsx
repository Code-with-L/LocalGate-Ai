import type { SimulatedTelemetryPoint } from "../mocks/gate";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

/**
 * CommandTrendChart — P1 chart shell over Recharts (DECISIONS.md choice).
 * Render-only: data arrives wrapped/typed from mocks; the chart never asks
 * for data itself.
 */

export interface CommandTrendChartProps {
  readonly points: readonly SimulatedTelemetryPoint[];
}

export function CommandTrendChart({ points }: CommandTrendChartProps) {
  return (
    <div className="lg-chart" role="img" aria-label="Simulated command trend chart">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={[...points]} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <XAxis dataKey="minuteUtc" stroke="var(--lg-text-tertiary)" />
          <YAxis allowDecimals={false} stroke="var(--lg-text-tertiary)" />
          <Tooltip
            contentStyle={{
              background: "var(--lg-surface-raised)",
              border: "1px solid var(--lg-border-strong)",
              color: "var(--lg-text-primary)",
            }}
          />
          <Line type="monotone" dataKey="commands" stroke="var(--lg-accent)" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
