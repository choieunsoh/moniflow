'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { Entry } from '../schema';
import { buildFlowOption } from '../chart';

// Thin wrapper: reads the live theme tokens (so it stays correct after a reskin), hands them to
// the pure option-builder, and manages the echarts instance lifecycle. All logic worth testing
// lives in ../chart.ts; this only touches the DOM.
export function FlowChart({ entries }: { entries: Entry[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const chart = echarts.init(el, null, { renderer: 'canvas' });
    const option = buildFlowOption(entries, {
      accent: token('--color-accent'),
      accentSoft: token('--color-accent-soft'),
      text: token('--color-text'),
      muted: token('--color-muted'),
      border: token('--color-border'),
    });
    chart.setOption({ ...option, animation: !reduce });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [entries]);

  return (
    <div ref={ref} className="h-56 w-full sm:h-[260px]" role="img" aria-label="Balance over time" />
  );
}
