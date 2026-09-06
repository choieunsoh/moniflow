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
//
// `max` shrinks the type until the string fits, because a canvas does not wrap, ellipsise or complain
// — it just draws past the edge and into whatever is beside it. The KPI row is where that bites: four
// tiles leave ~190px of usable width each, which a five-digit baht figure fills and a seven-digit one
// (or a longer label under a different locale) does not. Stepping down beats picking a size that is
// too small for every ordinary cycle in order to survive the rare wide one.
function textPainter(ctx: Ctx, family: string) {
  const fit = (s: string, px: number, weight: string, max: number) => {
    let size = px;
    ctx.font = `${weight} ${size}px ${family}`;
    while (size > 12 && ctx.measureText(s).width > max) {
      size -= 2;
      ctx.font = `${weight} ${size}px ${family}`;
    }
  };
  return (
    s: string,
    x: number,
    y: number,
    px: number,
    color: string,
    weight = '400',
    max = Infinity,
  ) => {
    if (max === Infinity) ctx.font = `${weight} ${px}px ${family}`;
    else fit(s, px, weight, max);
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

// The app mark, redrawn rather than fetched. It lives in shared/ui/Wordmark as three stroked paths
// on a 32-viewBox inside a muted rounded tile, and Path2D takes those exact `d` strings — so the card
// gets the real logo SYNCHRONOUSLY. An <img> of icon.svg would have meant awaiting onload before the
// share sheet, which is how this feature already lost a tap's transient activation once.
//
// ponytail: the paths are copied from Wordmark.tsx, which is itself hand-synced with app/icon.svg —
// a third copy of the same nine numbers. Worth extracting to one exported constant only if the mark
// is ever redrawn; until then three hand-synced copies beat a shared module nothing else imports.
const MARK_PATHS = [
  'M7.5 22 V15 A3 3 0 0 1 13.5 15 V22 M13.5 15 A3 3 0 0 1 19.5 15 V18.5',
  'M19.5 18.5 C20 21.5 22.8 22.4 25.2 20.4 L28 18',
  'M25.6 16.7 L28.2 17.8 L27 20.4',
] as const;

// Tile 44px with the glyph at 18/28 of it, the same ratio Wordmark renders at (an 18px svg in a
// size-7 tile), so the lockup keeps its proportions at card scale.
const MARK_TILE = 44;
const MARK_GLYPH = (MARK_TILE * 18) / 28;

function mark(ctx: Ctx, x: number, y: number, tile: string, glyph: string) {
  ctx.save();
  ctx.fillStyle = tile;
  ctx.beginPath();
  // Proportional corner, not --radius-sm: the token is a rem length and the card is not laid out in
  // rem. Matched by eye against the header's rounded tile.
  ctx.roundRect(x, y, MARK_TILE, MARK_TILE, MARK_TILE * 0.28);
  ctx.fill();

  const scale = MARK_GLYPH / 32;
  ctx.translate(x + (MARK_TILE - MARK_GLYPH) / 2, y + (MARK_TILE - MARK_GLYPH) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = glyph;
  ctx.lineWidth = 2.8; // in viewBox units — the scale above brings it to size, as SVG would
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of MARK_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
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
    const inner = kpiW - 56; // the tile's 28px padding on both sides
    draw(kpi.label, x + 28, KPI_Y + 54, 26, muted, '400', inner);
    draw(kpi.value, x + 28, KPI_Y + 112, 44, ink, '600', inner);
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

  // Footer: the mark + wordmark as one lockup on the left, the stamp opposite it on the right. Both
  // sit on the wordmark's baseline so the row reads as a line rather than two floating items.
  const footBase = H - PAD;
  mark(ctx, PAD, footBase - MARK_TILE + 8, muted, token('--color-on-fill'));
  draw('moniflow', PAD + MARK_TILE + 16, footBase, 30, muted, '600');
  ctx.textAlign = 'right';
  draw(card.generatedAt, W - PAD, footBase, 26, muted);
  ctx.textAlign = 'left';
}

// data: URL → Blob without a round trip through fetch(). navigator.share() needs the tap's transient
// user activation and this app has already been bitten by losing it across an await (see the comment
// block in use-backup-data), so the whole path from click to share stays synchronous.
function pngBlob(dataUrl: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

// `now` is the one input the caller does not hold: the card is stamped with the moment it was MADE,
// not the moment Home rendered, so it is read here at the tap rather than passed down as a prop that
// would go stale on a page left open.
export function ShareCardButton(props: Omit<ShareCardInput, 'now'>) {
  const onClick = () => {
    let png: Blob;
    let name: string;
    try {
      const card = buildShareCard({ ...props, now: new Date() });
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = cardHeight(card);
      render(canvas, card);
      png = pngBlob(canvas.toDataURL('image/png'));
      name = `moniflow-${props.label.replace(/\s+/g, '-').toLowerCase()}.png`;
    } catch {
      toast.error('Couldn’t make the card — try again');
      return;
    }
    // Called synchronously (nothing awaited above) so navigator.share still has the tap's transient
    // activation, then followed up rather than discarded. `void saveFile(...)` was the first cut and
    // it failed in BOTH directions: a share-sheet rejection surfaced nothing, and a successful
    // download surfaced nothing either — Chrome files it away in a toolbar bubble, so from inside the
    // page the whole feature looked inert. /settings' export already carries this lesson in a comment:
    // a silent success is indistinguishable from a swallowed failure.
    saveFile(name, 'image/png', png).then(
      () => toast('Card saved'),
      () => toast.error('Couldn’t share the card — try again'),
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      // Same shape as the collapsed search control it sits beside — a 44px grid cell with an 18px
      // glyph — so the two read as one row of header actions rather than two unrelated controls.
      aria-label="Share this cycle as an image"
      className="tap grid size-11 place-items-center rounded-[var(--radius-md)] text-[var(--color-muted)] transition-colors duration-150 hover:text-[var(--color-text)]"
    >
      <Share2 aria-hidden size={18} />
    </button>
  );
}
