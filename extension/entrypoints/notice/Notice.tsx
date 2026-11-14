// Privacy notice and consent (R7). M1 placeholder text; the full RA 10173 notice arrives in M5.
import { useState } from 'react';
import { NOTICE_VERSION } from '@ocm/core';
import { errorText, send } from '../../lib/send';
import { Alert, Button } from '../../lib/ui';

export function Notice() {
  const [adult, setAdult] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string>();
  const [started, setStarted] = useState(false);

  const start = async () => {
    setError(undefined);
    const res = await send({ type: 'attempt.start', age_confirmed: adult, consent_version: NOTICE_VERSION });
    if (!res.ok) return setError(errorText(res.code, res.message));
    setStarted(true);
  };

  if (started) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Monitoring started</h1>
        <p>Go back to your exam tab. Use the extension's popup to end the exam when you finish.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-6 text-base">
      <h1 className="text-xl font-semibold">Before you start</h1>
      <p className="rounded-md bg-risk-med-bg p-3 text-sm text-risk-med-fg">
        Draft notice for development (version {NOTICE_VERSION}). The full privacy notice is added in a later milestone.
      </p>
      <h2 className="text-lg font-semibold">What we collect while the exam is running</h2>
      <ul className="list-disc pl-6">
        <li>When you leave and return to the exam tab or the browser window, and how long you were away</li>
        <li>New tabs you open, and the website addresses you visit (site and page only, never search terms or form data)</li>
        <li>When you copy, cut, paste or right-click on the exam page (never what you copied)</li>
        <li>When the exam window enters or leaves fullscreen</li>
        <li>A heartbeat every 15 seconds showing that monitoring is on</li>
      </ul>
      <p>When you click Start, your exam window switches to fullscreen. Some actions show a warning; your examiner reviews every warning, and nothing ends your exam automatically.</p>
      <p>Your examiner for this exam can see this data. Nothing is collected before you click Start or after the exam ends.</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> I am 18 or older
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to this monitoring
      </label>
      {error && <Alert>{error}</Alert>}
      <Button disabled={!adult || !agree} onClick={() => void start()} className="self-start">
        Start exam monitoring
      </Button>
    </main>
  );
}
