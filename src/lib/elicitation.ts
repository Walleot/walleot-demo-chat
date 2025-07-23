type Resolver = { resolve: (v:any)=>void; reject:(e:any)=>void; timer: NodeJS.Timeout };
const waiters = new Map<string, Resolver>();

export function waitForUserInput(key: string, timeoutMs = 5 * 60_000) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(key);
      reject(new Error("timeout"));
    }, timeoutMs);
    waiters.set(key, { resolve, reject, timer });
  });
}

export function answerUserInput(key: string, data: any) {
  const w = waiters.get(key);
  if (!w) return false;
  clearTimeout(w.timer);
  w.resolve(data);
  waiters.delete(key);
  return true;
}