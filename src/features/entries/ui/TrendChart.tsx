'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { TrendBar } from '../trend';
import { buildTrendOption } from '../trend';

// Thin wrapper: reads live theme tokens + the resolved font (canvas can't use CSS vars), hands them
// to the pure option-builder, and manages the echarts instance lifecycle. Logic lives in ../trend.ts.
export function TrendChart({ bars, label }: { bars: TrendBar[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const chart = echarts.init(el, null, { renderer: 'canvas' });
    const option = buildTrendOption(bars, {
      text: token('--color-text'),
      muted: token('--color-muted'),
      border: token('--color-border'),
      surface2: token('--color-surface-2'),
      accent: token('--color-accent'),
      font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    });
    chart.setOption({ ...option, animation: !reduce });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [bars]);

  return <div ref={ref} className="h-56 w-full" role="img" aria-label={label} />;
}
