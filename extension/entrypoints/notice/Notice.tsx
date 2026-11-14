// Privacy notice and consent (R7, R26). Written for the Philippine Data Privacy Act of 2012 (RA 10173)
// and the NPC education-sector advisory (RESEARCH F23). Every item listed here must match what the
// extension actually collects (QAD T45). Bump NOTICE_VERSION in packages/core on any wording change.
import { useEffect, useState } from 'react';
import { NOTICE_VERSION, type AttemptStatus } from '@icu/core';
import { errorText, send } from '../../lib/send';
import { Alert, Button, formatTime } from '../../lib/ui';

export function Notice() {
  const [status, setStatus] = useState<AttemptStatus>();
  const [adult, setAdult] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string>();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    void send<AttemptStatus>({ type: 'attempt.status' }).then((res) => res.ok && setStatus(res.data));
  }, []);

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
        <p>Go back to your exam tab. When you finish, open the extension and choose End exam.</p>
      </main>
    );
  }

  const session = status?.session;
  const examiner = session ? `${session.admin_name} (${session.admin_email})` : 'your examiner';

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-6 text-base">
      <h1 className="text-xl font-semibold">ICU privacy notice: exam monitoring</h1>
      {session && (
        <p className="text-sm text-muted">
          Exam: {session.name} · {formatTime(session.starts_at)} – {formatTime(session.ends_at)} · Examiner: {examiner}
        </p>
      )}

      <section>
        <h2 className="text-lg font-semibold">What we collect</h2>
        <p>Only between the moment you click Start and the end of the exam, and only in this browser:</p>
        <ul className="list-disc pl-6">
          <li>When you leave and return to the exam tab or the browser window, and how long you were away.</li>
          <li>New tabs you open, and the addresses of pages you visit, as site and page only (for example chatgpt.com/c). Never search terms, form data or anything after a “?”.</li>
          <li>When you copy, cut, paste or right-click on the exam page. Never what you copied or pasted.</li>
          <li>When the exam window enters or leaves fullscreen. Your exam window switches to fullscreen when you click Start.</li>
          <li>A screenshot of the browser tab in front every minute, and when a warning is shown. If another tab is in front, the screenshot shows that tab, which may include personal information.</li>
          <li>A heartbeat every 15 seconds that shows monitoring is on, and the times of any warnings shown to you.</li>
          <li>Your name and email from your account, and when you agreed to this notice.</li>
        </ul>
        <p>We do not use your camera or microphone, and we do not record keystrokes, your answers, or the text of any page.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Why</h2>
        <p>To help your examiner check that the exam was taken fairly. The tool only records and flags activity; it never ends your exam or decides that you cheated. A person reviews every flag.</p>
        <p>An automated system analyses an anonymous summary of this activity (without your name or email) and suggests a result to your examiner. The suggestion can be wrong; your examiner always makes the final decision.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Who can see it</h2>
        <p>Only the examiner who created this exam: {examiner}. The data is stored with our hosting provider, Supabase, on servers in Singapore.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">How long we keep it</h2>
        <p>Monitoring data and screenshots are deleted automatically 30 days after the exam ends. Your examiner can delete them sooner.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Your rights</h2>
        <p>
          Under the Data Privacy Act of 2012 you have the right to be informed, to access your data, to have it corrected,
          to object, to have it erased or blocked, and to file a complaint with the National Privacy Commission. To use
          these rights, or to ask for your data to be deleted, contact {examiner}.
        </p>
        <p>If you use a screen reader or another assistive tool, tell your examiner before you start: it may trigger focus or paste events.</p>
      </section>

      <p className="text-xs text-muted">Notice version {NOTICE_VERSION}</p>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> I am 18 or older
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read this notice and agree to this monitoring
      </label>
      {error && <Alert>{error}</Alert>}
      <Button disabled={!adult || !agree} onClick={() => void start()} className="self-start">
        Start exam monitoring
      </Button>
    </main>
  );
}
