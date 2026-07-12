import '@testing-library/jest-dom/vitest';

// jsdom does not implement elementFromPoint; define a no-op stub so tests can vi.spyOn it
// (used by useGridReorder to find the tile under the pointer during a drag).
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
