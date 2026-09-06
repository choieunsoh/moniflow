'use client';

import { Share2 } from 'lucide-react';
import { saveFile } from '@shared/save-file';
import { toast } from '@shared/ui/toast';
import { buildShareCard, type ShareCard, type ShareCardInput } from '../share-card';

// Draws the cycle summary as a standalone PNG and hands it to the OS share sheet.
//
// Deliberately NOT a screenshot: no browser API can capture this page (getDisplayMedia is screen
// capture and is unavailable on mobile), and the DOM-rasterising libraries that pretend otherwise
// re-implement a CSS engine in JS — one that does not speak `light-dark()`, which every one of this
// app's 46 colour declarations is written in. So the card is drawn from scratch on a canvas, reading
// the SAME resolved tokens and font the donut reads, which is why it comes out on-theme rather than
// approximately on-theme.
//
// The renderer is untested by design, matching DonutChart: the decisions (which KPIs, which rows,
// what the shares divide by) live in ../share-card.ts and are tested there; what is left here is
// positioning, which a test would only restate.

const W = 1080;
const PAD = 72;
// Baselines, top-down. Named rather than inlined because the card's height is derived from them
// below — a hardcoded height left a quarter of the card empty on a cycle with few categories.
const TITLE_Y = 130;
const LABEL_Y = 240;
const HEADLINE_Y = 330;
const RING_CY = 250;
const RING_R = 140;
const KPI_Y = 430;
const KPI_H = 144;
const ROW_1_Y = KPI_Y + KPI_H + 86;
const ROW_STEP = 80;
// Below the last row: the wordmark's own line plus the bottom padding it sits on. Generous on
// purpose — at one row-step of clearance the wordmark read as a ninth category.
const FOOT = 200;

function cardHeight(card: ShareCard): number {
  const lastRow = ROW_1_Y + Math.max(0, card.rows.length - 1) * ROW_STEP;
  return Math.round(lastRow + FOOT);
}

type Ctx = CanvasRenderingContext2D;

// Canvas takes a full CSS font shorthand and has no notion of inheritance, so every fillText has to
// restate family and weight. Resolved once per render and closed over.
function textPainter(ctx: Ctx, family: string) {
  return (s: string, x: number, y: number, px: number, color: string, weight = '400') => {
    ctx.font = `${weight} ${px}px ${family}`;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };
}

// The ring, arced by hand from the same rows the captions below it name. Starts at 12 o'clock and
// runs clockwise so the biggest category sits where the eye lands first, matching Home's donut.
function ring(ctx: Ctx, card: ShareCard, cx: number, cy: number, r: number) {
  const total = card.rows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return;
  let start = -Math.PI / 2;
  ctx.lineWidth = r * 0.38;
  for (const row of card.rows) {
    const end = start + (row.value / total) * Math.PI * 2;
    ctx.beginPath();
    // Inset by half the stroke so the band's OUTER edge lands on r, not on r + lineWidth / 2.
    ctx.arc(cx, cy, r - ctx.lineWidth / 2, start, end);
    ctx.strokeStyle = row.color;
    ctx.stroke();
    start = end;
  }
}

function render(canvas: HTMLCanvasElement, card: ShareCard) {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D unavailable');
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const ink = token('--color-text');
  const muted = token('--color-muted');
  const surface = token('--color-surface');
  const draw = textPainter(ctx, getComputedStyle(document.body).fontFamily || 'sans-serif');
  const H = canvas.height;

  ctx.fillStyle = token('--color-bg');
  ctx.fillRect(0, 0, W, H);

  draw(card.title, PAD, TITLE_Y, 52, ink, '600');
  draw(card.headlineLabel, PAD, LABEL_Y, 30, muted);
  draw(card.headline, PAD, HEADLINE_Y, 88, ink, '700');

  ring(ctx, card, W - PAD - RING_R, RING_CY, RING_R);

  // KPI tiles: one surface-coloured card per figure, split evenly across the content width.
  const gap = 20;
  const kpiW = (W - PAD * 2 - gap * (card.kpis.length - 1)) / card.kpis.length;
  for (const [i, kpi] of card.kpis.entries()) {
    const x = PAD + i * (kpiW + gap);
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.roundRect(x, KPI_Y, kpiW, KPI_H, 24);
    ctx.fill();
    draw(kpi.label, x + 28, KPI_Y + 54, 26, muted);
    draw(kpi.value, x + 28, KPI_Y + 112, 44, ink, '600');
  }

  // Ranked categories. The amount is right-aligned against the card edge and the share sits left of
  // it, so both numeric columns line up down the list the way they do in the legend on Home.
  let y = ROW_1_Y;
  for (const row of card.rows) {
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(PAD + 14, y - 12, 14, 0, Math.PI * 2);
    ctx.fill();
    draw(row.name, PAD + 48, y, 36, ink);
    ctx.textAlign = 'right';
    draw(row.amount, W - PAD, y, 36, ink, '600');
    draw(row.share, W - PAD - 250, y, 30, muted);
    ctx.textAlign = 'left';
    y += ROW_STEP;
  }

  draw('moniflow', PAD, H - PAD, 28, muted, '600');
}

// data: URL → Blob without a round trip through fetch(). navigator.share() needs the tap's transient
// user activation and this app has already been bitten by losing it across an await (see the comment
// block in use-backup-data), so the whole path from click to share stays synchronous.
function pngBlob(dataUrl: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

export function ShareCardButton(props: ShareCardInput) {
  const onClick = () => {
    try {
      const card = buildShareCard(props);
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = cardHeight(card);
      render(canvas, card);
      const name = `moniflow-${props.label.replace(/\s+/g, '-').toLowerCase()}.png`;
      void saveFile(name, 'image/png', pngBlob(canvas.toDataURL('image/png')));
    } catch {
      toast.error('Couldn’t make the card — try again');
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="tap flex items-center gap-1.5 text-sm"
      style={{ color: 'var(--color-muted)' }}
    >
      <Share2 aria-hidden size={16} />
      Share
    </button>
  );
}
