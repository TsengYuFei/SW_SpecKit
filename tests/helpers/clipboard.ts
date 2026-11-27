import type { BrowserContext, Page } from '@playwright/test';

export async function installClipboard(
  context: BrowserContext,
  mode: 'resolve' | 'reject' | 'pending' | 'missing',
) {
  await context.addInitScript((mode) => {
    const state = {
      writes: [] as string[],
      reads: 0,
      activation: [] as boolean[],
      pending: [] as { resolve: () => void; reject: () => void }[],
    };
    Object.assign(window, { clipboardTest: state });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value:
        mode === 'missing'
          ? undefined
          : {
              writeText(value: string) {
                state.writes.push(value);
                state.activation.push(navigator.userActivation.isActive);
                if (mode === 'resolve') return Promise.resolve();
                if (mode === 'reject') return Promise.reject(new Error('DENIED'));
                return new Promise<void>((resolve, reject) => {
                  state.pending.push({ resolve, reject: () => reject(new Error('DENIED')) });
                });
              },
              readText() {
                state.reads++;
                throw new Error('UNEXPECTED_READ');
              },
            },
    });
  }, mode);
}

export async function clipboardState(page: Page) {
  return page.evaluate(() => {
    const state = (
      window as unknown as {
        clipboardTest: { writes: string[]; reads: number; activation: boolean[] };
      }
    ).clipboardTest;
    return { writes: state.writes, reads: state.reads, activation: state.activation };
  });
}

export async function settleClipboard(page: Page, success = true) {
  await page.evaluate((success) => {
    const state = (
      window as unknown as {
        clipboardTest: { pending: { resolve: () => void; reject: () => void }[] };
      }
    ).clipboardTest;
    const operation = state.pending.shift()!;
    if (success) operation.resolve();
    else operation.reject();
  }, success);
}
