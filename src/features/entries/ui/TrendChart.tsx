'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { TrendBar } from '../trend';
import { buildTrendOption, trendSummary } from '../trend';

// Thin wrapper: reads live theme tokens + the resolved font (canvas can't use CSS vars), hands them
// to the pure option-builder, and manages the echarts instance lifecycle. Logic lives in ../trend.ts.
//
// One effect, keyed to `bars`: init → setOption → dispose per render. An init-once/update-on-[bars]
// split was tried and reverted — the page's `ready`-gate (use-analytics sets ready=false on every
// refetch, and the route renders a `…` placeholder while !ready) unmounts this whole subtree on each
// write, so the chart is a fresh instance every time regardless. Splitting the effect bought nothing
// the ready-gate doesn't already force, and left a setOption(notMerge) guarding a merge that can't
// happen. If the ready-gate is ever changed to keep the chart mounted across refetches, revisit this.
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

  return (
    <div ref={ref} className="h-56 w-full" role="img" aria-label={trendSummary(bars, label)} />
  );
}
