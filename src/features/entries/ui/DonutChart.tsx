'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useResolvedTheme } from '@shared/use-resolved-theme';
import type { Breakdown } from '../queries';
import { buildDonutOption, donutSummaryLabel } from '../donut';

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
  // Canvas bakes token VALUES, so the chart must rebuild when the resolved theme moves. Under
  // 'system' an OS switch repaints every CSS colour live and bumps nothing else — without this
  // dep the chart kept the old theme's ink on a card that had already changed around it.
  const theme = useResolvedTheme();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const chart = echarts.init(el, null, { renderer: 'canvas' });
    // Rebuilt rather than just resized on every resize: the hole's text is sized off the root
    // font-size, and browser zoom changes that without remounting us. `resize` fires on zoom, so
    // re-reading rootPx here is what keeps the centre figure in step with the rest of the page.
    const render = () => {
      const option = buildDonutOption(rows, {
        text: token('--color-text'),
        muted: token('--color-muted'),
        surface: token('--color-surface'),
        font: getComputedStyle(document.body).fontFamily || 'sans-serif',
        // Clamped, not raw: the wrapper's height is in rem (so it grows with text scale) but its
        // width is a percentage of the fixed phone frame (so it doesn't). echarts sizes the ring off
        // the SMALLER of the two, which means at 200% the text would scale past a hole that hadn't.
        // ponytail: divisor tuned so the longest realistic total (฿999,999) clears the hole; revisit
        // if the frame width or the 62% inner radius changes.
        rootPx: Math.min(
          parseFloat(css.fontSize) || 16,
          Math.min(el.clientWidth, el.clientHeight) / 14,
        ),
      });
      chart.setOption({ ...option, animation: !reduce });
    };
    render();

    const onResize = () => {
      chart.resize();
      render();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [rows, theme]);

  return (
    // pointer-events-none so a swipe over the donut passes through to the cycle-swipe wrapper
    // (echarts' canvas would otherwise eat the gesture). The legend below carries the same figures,
    // so the hover/tap tooltip isn't missed on this mobile surface.
    <div
      ref={ref}
      className="pointer-events-none mx-auto h-64 w-full"
      role="img"
      // The total lives in canvas pixels, so the label has to restate it — otherwise the page's
      // whole answer is simply absent for a screen-reader user.
      aria-label={donutSummaryLabel(rows, label)}
    />
  );
}
