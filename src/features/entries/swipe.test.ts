import { describe, expect, it } from 'vitest';
import { resolveSwipe, beginsDrag, commitHref, DRAG_START, COMMIT } from './swipe';

const W = 88; // panel width; threshold = 44

describe('resolveSwipe', () => {
  it('stays closed below the threshold either way', () => {
    expect(resolveSwipe(0, W)).toBe(0);
    expect(resolveSwipe(-43, W)).toBe(0);
    expect(resolveSwipe(43, W)).toBe(0);
  });

  it('opens the delete side on a left swipe past the threshold', () => {
    expect(resolveSwipe(-44, W)).toBe(-1);
    expect(resolveSwipe(-88, W)).toBe(-1);
  });

  it('opens the edit side on a right swipe past the threshold', () => {
    expect(resolveSwipe(44, W)).toBe(1);
    expect(resolveSwipe(88, W)).toBe(1);
  });

  it('honours a custom threshold', () => {
    expect(resolveSwipe(20, W, 16)).toBe(1);
    expect(resolveSwipe(-20, W, 16)).toBe(-1);
    expect(resolveSwipe(10, W, 16)).toBe(0);
  });
});

describe('beginsDrag', () => {
  // THE reason a tappable row can be swiped at all: a press that has barely moved is still a tap,
  // so it is left alone and reaches the link underneath.
  it('treats a barely-moved press as a tap, not a drag', () => {
    expect(beginsDrag(0, 0)).toBe(false);
    expect(beginsDrag(DRAG_START - 1, 0)).toBe(false);
    expect(beginsDrag(-(DRAG_START - 1), 0)).toBe(false);
  });

  // The slop is an ABSOLUTE touch tolerance, not a free parameter, and the tests above cannot pin it
  // because they are all written relative to DRAG_START. A thumb tap on a phone drifts several px
  // sideways before it lifts; any drift over the slop captures the press as a drag, which then
  // springs back (nowhere near COMMIT) and has its click suppressed — so the row silently does
  // nothing at all. Measured in a touch-emulated browser: an 8px drift on a /report month row
  // navigated nowhere. Both platforms' own tap slop is ~8–10px, so the slop must clear that.
  it('leaves a thumb tap’s sideways drift alone', () => {
    expect(beginsDrag(8, 3)).toBe(false);
    expect(beginsDrag(-10, 2)).toBe(false);
  });

  it('starts dragging once a clearly horizontal movement passes the slop', () => {
    expect(beginsDrag(DRAG_START, 0)).toBe(true);
    expect(beginsDrag(-30, 2)).toBe(true);
  });

  // A scroll must never be stolen. touch-action covers touch; this covers a mouse drag, where the
  // browser gives no help.
  it('yields to a mostly-vertical movement, ties included', () => {
    expect(beginsDrag(10, 40)).toBe(false);
    expect(beginsDrag(-10, -40)).toBe(false);
    expect(beginsDrag(20, 20)).toBe(false);
  });
});

describe('commitHref', () => {
  it('springs back short of the commit distance', () => {
    expect(commitHref(COMMIT - 1, '/prev', '/next')).toBeNull();
    expect(commitHref(-(COMMIT - 1), '/prev', '/next')).toBeNull();
  });

  it('goes forward on a left drag and back on a right one', () => {
    expect(commitHref(-COMMIT, '/prev', '/next')).toBe('/next');
    expect(commitHref(COMMIT, '/prev', '/next')).toBe('/prev');
  });

  // The whole point of passing hrefs rather than a step: a closed direction springs back, so the
  // gesture can never land where the stepper's arrow is disabled.
  it('springs back when the direction is closed', () => {
    expect(commitHref(-200, '/prev', null)).toBeNull();
    expect(commitHref(200, null, '/next')).toBeNull();
  });
});
