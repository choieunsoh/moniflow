import type { Entry } from './schema';

// Colors are injected (read from CSS tokens by the client wrapper) so this stays pure and
// theme-aware without importing echarts or touching the DOM — which is what makes it testable.
export type ChartPalette = {
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  border: string;
};

export type FlowPoint = { date: string; balance: number };

// entries → end-of-day running balance, one point per date, chronologically. This is the
// money-flow story the chart tells: not individual transactions, but where the balance stands
// over time. Pure and deterministic — the unit test pins the accumulation.
export function toCumulativeBalance(entries: Entry[]): FlowPoint[] {
  const sorted = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
  );
  const byDate = new Map<string, number>();
  let running = 0;
  for (const e of sorted) {
    running += e.amount;
    byDate.set(e.date, running); // later same-date entries overwrite → end-of-day balance
  }
  return [...byDate].map(([date, balance]) => ({ date, balance }));
}

// Returns a plain ECharts option object. The area fill uses echarts' plain linear-gradient
// descriptor (no graphic.LinearGradient import needed), keeping the builder dependency-free.
export function buildFlowOption(entries: Entry[], p: ChartPalette) {
  const points = toCumulativeBalance(entries);
  return {
    animationDuration: 600,
    grid: { top: 16, right: 16, bottom: 28, left: 56 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e2128',
      borderColor: p.border,
      borderWidth: 1,
      textStyle: { color: p.text, fontFamily: 'inherit' },
      valueFormatter: (v: number) => `฿${new Intl.NumberFormat('en-US').format(Math.round(v))}`,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((pt) => pt.date),
      axisLine: { lineStyle: { color: p.border } },
      axisTick: { show: false },
      axisLabel: { color: p.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: p.border, opacity: 0.5 } },
      axisLabel: {
        color: p.muted,
        fontSize: 11,
        formatter: (v: number) =>
          `฿${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(v)}`,
      },
    },
    series: [
      {
        name: 'Balance',
        type: 'line',
        smooth: 0.35,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        data: points.map((pt) => pt.balance),
        lineStyle: { width: 2, color: p.accent },
        itemStyle: { color: p.accent },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: p.accentSoft },
              { offset: 1, color: 'rgba(0,0,0,0)' },
            ],
          },
        },
      },
    ],
  };
}
