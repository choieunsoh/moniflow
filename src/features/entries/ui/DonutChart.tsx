'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { Breakdown } from '../queries';
import { buildDonutOption } from '../donut';

// Thin wrapper: reads live theme tokens + the resolved font (canvas can't use CSS vars), hands them
// to the pure option-builder, and manages the echarts instance lifecycle. Logic lives in ../donut.ts.
export function DonutChart({ rows }: { rows: Breakdown[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const chart = echarts.init(el, null, { renderer: 'canvas' });
    const option = buildDonutOption(rows, {
      text: token('--color-text'),
      muted: token('--color-muted'),
      border: token('--color-border'),
      surface: token('--color-surface'),
      font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    });
    chart.setOption({ ...option, animation: !reduce });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [rows]);

  return (
    <div ref={ref} className="mx-auto h-64 w-full" role="img" aria-label="Spending by category" />
  );
}
