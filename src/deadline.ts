/** A promise that rejects after `ms`, and a function that cancels it. Use with Promise.race, then always cancel. */
export function timeoutAfter(ms: number, message: string): [Promise<never>, () => void] {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return [promise, () => clearTimeout(timer)];
}
