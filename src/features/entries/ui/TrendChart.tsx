'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { TrendBar } from '../trend';
import { buildTrendOption, trendSummary } from '../trend';

// Thin wrapper: reads live theme tokens + the resolved font (canvas can't use CSS vars), hands them
// to the pure option-builder, and manages the echarts instance lifecycle. Logic lives in ../trend.ts.
export function TrendChart({ bars, label }: { bars: TrendBar[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Init once. `bars` is a fresh array on every read, so keying this effect to it would dispose and
  // rebuild the whole instance after every write.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const option = buildTrendOption(bars, {
      text: token('--color-text'),
      muted: token('--color-muted'),
      border: token('--color-border'),
      surface2: token('--color-surface-2'),
      accent: token('--color-accent'),
      font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    });
    // notMerge. ECharts MERGES by default, so when the average line goes away — you delete entries
    // and drop below two complete cycles — a merged update would leave the old markLine painted on
    // a chart that no longer has an average. Replace the option outright.
    chart.setOption({ ...option, animation: !reduce }, true);
  }, [bars]);

  return (
    <div ref={ref} className="h-56 w-full" role="img" aria-label={trendSummary(bars, label)} />
  );
}
