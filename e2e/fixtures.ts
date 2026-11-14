// Playwright fixtures: a persistent Chromium context with the E2E extension loaded, plus helpers
// that talk to the service worker the same way the popup does (runtime messages).
import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Message, Response } from '@ocm/core';
import { clientAs, serviceClient, TEST_PASSWORD, TEST_USERS } from '../supabase/scripts/testEnv';

export const EXAM_URL = 'http://localhost:4173/exam/form.html';
export const OTHER_URL = 'http://localhost:4173/other/page.html';
const extensionPath = join(import.meta.dirname, '../extension/.output/chrome-mv3-e2e');

interface Fixtures {
  context: BrowserContext;
  userDataDir: string;
  worker: Worker;
  extensionId: string;
  ext: ExtensionDriver;
}

export async function launch(userDataDir: string, headless = true): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
}

export class ExtensionDriver {
  constructor(private readonly context: BrowserContext, readonly extensionId: string) {}
  private page?: Page;

  /** An extension page used only to send runtime messages, in its own unfocused window so it
   *  doesn't interfere with tab switching. Not popup.html: an open popup suppresses focus events (A5). */
  async messenger(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const worker = this.context.serviceWorkers()[0]!;
    const url = `chrome-extension://${this.extensionId}/notice.html`;
    await worker.evaluate((u) => chrome.windows.create({ url: u, focused: false }), url);
    const page = await this.context.waitForEvent('page', (p) => p.url() === url);
    this.page = page;
    return page;
  }

  async send<T>(message: Message): Promise<T> {
    const page = await this.messenger();
    const res = (await page.evaluate((m) => chrome.runtime.sendMessage(m), message)) as Response<T>;
    if (!res.ok) throw new Error(`${message.type} failed: ${res.code} ${res.message}`);
    return res.data;
  }

  /** Runs code in the service worker (e.g. to inspect chrome.* state). */
  async inWorker<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.context.serviceWorkers()[0]!.evaluate(fn);
  }
}

export const test = base.extend<Fixtures>({
  userDataDir: async ({}, use) => {
    await use(mkdtempSync(join(tmpdir(), 'ocm-e2e-')));
  },
  // Uses Playwright's built-in `headless` option; window-focus tests run headed (focus-return
  // events are not emitted in headless Chromium, verified 2026-11-14).
  context: async ({ userDataDir, headless }, use) => {
    const context = await launch(userDataDir, headless);
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  ext: async ({ context, extensionId }, use) => {
    await use(new ExtensionDriver(context, extensionId));
  },
});
export { expect };

// ---------------------------------------------------------------------------
// Backend helpers (ocm-test)
// ---------------------------------------------------------------------------

let adminClient: SupabaseClient | undefined;
export async function admin(): Promise<SupabaseClient> {
  adminClient ??= await clientAs('adminA');
  return adminClient;
}

export async function createSession(opts: { warningLimit?: number; endsInMin?: number } = {}) {
  const db = await admin();
  const { data, error } = await db.rpc('create_session', {
    p_name: `E2E ${new Date().toISOString()}`,
    p_url_patterns: ['http://localhost:4173/exam/*'],
    p_starts_at: new Date(Date.now() - 60_000).toISOString(),
    p_ends_at: new Date(Date.now() + (opts.endsInMin ?? 60) * 60_000).toISOString(),
    p_warning_limit: opts.warningLimit ?? 3,
  });
  if (error) throw error;
  return data as { id: string; code: string };
}

export interface EventRow {
  type: string;
  occurred_at: string;
  details: Record<string, unknown>;
}

export async function events(attemptId: string): Promise<EventRow[]> {
  const { data, error } = await serviceClient().from('events').select('type, occurred_at, details').eq('attempt_id', attemptId).order('occurred_at');
  if (error) throw error;
  return data;
}

export async function heartbeats(attemptId: string): Promise<{ received_at: string; source: string }[]> {
  const { data, error } = await serviceClient().from('heartbeats').select('received_at, source').eq('attempt_id', attemptId).order('received_at');
  if (error) throw error;
  return data;
}

/** Polls until the predicate holds for the attempt's events (uploads are asynchronous). */
export async function waitForEvents(attemptId: string, predicate: (rows: EventRow[]) => boolean, timeoutMs = 20_000): Promise<EventRow[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: EventRow[] = [];
  while (Date.now() < deadline) {
    rows = await events(attemptId);
    if (predicate(rows)) return rows;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return rows;
}

export const count = (rows: EventRow[], type: string) => rows.filter((r) => r.type === type).length;

/** Signs in as student-1, joins a new session and starts monitoring with the exam page open. */
export async function startExam(context: BrowserContext, ext: ExtensionDriver, opts: { warningLimit?: number; endsInMin?: number; openExam?: boolean } = {}) {
  const session = await createSession(opts);
  const exam = await context.newPage();
  if (opts.openExam !== false) await exam.goto(EXAM_URL);
  await ext.send({ type: 'auth.signIn', email: TEST_USERS.student1.email, password: TEST_PASSWORD });
  const joined = await ext.send<{ attempt_id: string }>({ type: 'attempt.join', code: session.code });
  await ext.send({ type: 'attempt.start', age_confirmed: true, consent_version: 'e2e' });
  if (opts.openExam !== false) await exam.bringToFront();
  return { session, exam, attemptId: joined.attempt_id };
}
