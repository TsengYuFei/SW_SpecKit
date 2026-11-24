export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export function googleReadDouble<T>(response: () => Promise<T>) {
  const calls: string[] = [];
  return {
    calls,
    async read(spreadsheetId: string): Promise<T> {
      calls.push(spreadsheetId);
      return response();
    },
  };
}
