// The worker's reply shape. `rows` / `results` / `bytes` are declared required even though any given
// reply carries only the one matching its request: each caller in browser.ts reads only the field its
// own request populated, and typing them required (rather than optional) keeps `rows` as `unknown[]`
// — assignable to sqlite-proxy's `{ rows: any[] }` callback contract without an `as` cast. A not-found
// `.get()` arrives as a runtime `undefined` under this type (noUncheckedIndexedAccess is off), which is
// exactly what drizzle's mapGetResult needs to return `undefined`.
type WorkerReply = {
  id: number;
  ok: boolean;
  error?: string;
  rows: unknown[];
  results: { rows: unknown[] }[];
  bytes: Uint8Array;
};

type Pending = { resolve: (value: WorkerReply) => void; reject: (reason: unknown) => void };

// One worker, one message-id counter, a map of in-flight requests. Every call resolves when the worker
// posts back the matching id.
export class DbWorkerRpc {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
      const data = event.data;
      const p = this.pending.get(data.id);
      if (p === undefined) return;
      this.pending.delete(data.id);
      if (data.ok) p.resolve(data);
      else p.reject(new Error(String(data.error)));
    });
  }

  send(payload: Record<string, unknown>): Promise<WorkerReply> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...payload });
    });
  }
}
