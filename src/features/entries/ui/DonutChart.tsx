'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { Breakdown } from '../queries';
import { buildDonutOption } from '../donut';

// Thin wrapper: reads live theme tokens + the resolved font (canvas can't use CSS vars), hands them
// to the pure option-builder, and manages the echarts instance lifecycle. Logic lives in ../donut.ts.
export function DonutChart({
  rows,
  label = 'Spending by category',
}: {
  rows: Breakdown[];
  label?: string;
}) {
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
      surface2: token('--color-surface-2'),
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
    // pointer-events-none so a swipe over the donut passes through to the cycle-swipe wrapper
    // (echarts' canvas would otherwise eat the gesture). The legend below carries the same figures,
    // so the hover/tap tooltip isn't missed on this mobile surface.
    <div
      ref={ref}
      className="pointer-events-none mx-auto h-64 w-full"
      role="img"
      aria-label={label}
    />
  );
}
