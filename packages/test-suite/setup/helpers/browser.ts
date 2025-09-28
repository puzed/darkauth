import type { Page } from '@playwright/test';

type CaptureMatcher = string | RegExp;

export function attachConsoleLogging(page: Page, label: string): void {
  page.on('console', (message) => {
    console.log(`${label} console`, message.type(), message.text());
    const args = message.args();
    if (args.length === 0) return;
    Promise.all(args.map((arg) => arg.jsonValue().catch(() => undefined)))
      .then((values) => {
        console.log(`${label} console values`, values);
      })
      .catch((error) => {
        console.log(`${label} console values read error`, error);
      });
  });
}

export function attachNetworkLogging(page: Page, options?: { label?: string; captureBodies?: CaptureMatcher[] }): void {
  const label = options?.label ?? 'page';
  const captureBodies = options?.captureBodies ?? [];
  page.on('pageerror', (error) => {
    console.log(`${label} page error`, error);
  });
  page.on('request', (request) => {
    console.log(`${label} request`, request.method(), request.url());
  });
  page.on('response', (response) => {
    console.log(`${label} response`, response.status(), response.url());
    if (!captureBodies.some((matcher) => matchesCapture(response.url(), matcher))) return;
    response
      .text()
      .then((body) => {
        console.log(`${label} response body`, response.url(), body);
      })
      .catch((error) => {
        console.log(`${label} response body read failed`, response.url(), error);
      });
  });
  page.on('requestfailed', (request) => {
    console.log(`${label} request failed`, request.url(), request.failure()?.errorText);
  });
}

function matchesCapture(url: string, matcher: CaptureMatcher): boolean {
  if (typeof matcher === 'string') return url.includes(matcher);
  return matcher.test(url);
}

export function toUrlString(value: string | URL): string {
  return typeof value === 'string' ? value : value.toString();
}
