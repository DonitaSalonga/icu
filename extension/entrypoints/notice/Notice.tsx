// Privacy notice, consent and whole-screen sharing (R7, R26, D9). Written for the Philippine Data Privacy
// Act of 2012 (RA 10173) and the NPC education-sector advisory (RESEARCH F23). Every item listed here must
// match what the extension collects (QAD T45). Bump NOTICE_VERSION in packages/core on any wording change.
// After Start this page holds the screen share and stays open as the pinned "ICU monitoring" tab.
import { useEffect, useRef, useState } from 'react';
import { NOTICE_VERSION, type AttemptStatus } from '@icu/core';
import { requestScreenShare, serveFrames } from '../../lib/screen';
import { errorText, send } from '../../lib/send';
import { Alert, Button, ExamAbout, formatTime } from '../../lib/ui';

const reshare = new URLSearchParams(location.search).has('reshare');

export function Notice() {
  const [status, setStatus] = useState<AttemptStatus>();
  const [adult, setAdult] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [ended, setEnded] = useState(false);
  const stopRef = useRef<() => void>();

  useEffect(() => {
    void send<AttemptStatus>({ type: 'attempt.status' }).then((res) => res.ok && setStatus(res.data));
    const onMessage = (m: { type?: string }) => {
      if (m?.type === 'monitor.stop') {
        stopRef.current?.();
        stopRef.current = undefined;
        setEnded(true);
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  // While monitoring, keep the exam-tab status fresh: it decides between "Go to my exam" and "open your exam".
  useEffect(() => {
    if (!monitoring) return;
    const refresh = () => void send<AttemptStatus>({ type: 'attempt.status' }).then((res) => res.ok && setStatus(res.data));
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [monitoring]);

  useEffect(() => {
    document.title = monitoring ? 'ICU monitoring · keep this tab open' : 'Privacy notice · ICU: I Caught You';
  }, [monitoring]);

  /** Q36/Q37: the exam starts only with the entire screen shared. */
  const shareAndStart = async () => {
    setError(undefined);
    setBusy(true);
    let stream: MediaStream | undefined;
    try {
      stream = await requestScreenShare();
      stopRef.current = serveFrames(stream, () => void send({ type: 'screen.stopped' }));
      const shared = await send({ type: 'screen.started' });
      if (!shared.ok) throw new Error(shared.code);
      if (!reshare) {
        const res = await send({ type: 'attempt.start', age_confirmed: adult, consent_version: NOTICE_VERSION });
        if (!res.ok) throw new Error(res.code);
      }
      setMonitoring(true);
    } catch (e) {
      stopRef.current?.();
      stopRef.current = undefined;
      const code = e instanceof Error ? e.message : String(e);
      setError(errorText(code, ''));
    } finally {
      setBusy(false);
    }
  };

  if (ended) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Exam ended</h1>
        <p>Screen sharing has stopped. You can close this tab.</p>
      </main>
    );
  }

  const session = status?.session;

  if (monitoring) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">ICU monitoring</h1>
        <p role="status" className="rounded-md bg-risk-med-bg p-3 text-risk-med-fg">
          Keep this tab open until the exam ends. Closing it, or clicking “Stop sharing”, is recorded and shown to your examiner.
        </p>
        {status?.exam_tab_bound ? (
          <>
            <p>Your exam is open in another tab. When you finish, open the ICU extension and choose End exam.</p>
            {error && <Alert>{error}</Alert>}
            <Button className="self-start" onClick={() => void send({ type: 'attempt.focusExam' }).then((res) => !res.ok && setError(errorText(res.code, res.message)))}>
              Go to my exam
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Now open your exam in this browser.</p>
            {session && <ExamAbout session={session} />}
            <p className="text-sm text-muted">Your window switches to fullscreen when the exam page opens. When you finish, open the ICU extension and choose End exam.</p>
          </div>
        )}
      </main>
    );
  }

  const examiner = session ? `${session.admin_name} (${session.admin_email})` : 'your examiner';

  if (reshare) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Share your screen again</h1>
        <p>Your exam requires sharing your entire screen. Choose your screen in the window Chrome opens.</p>
        {error && <Alert>{error}</Alert>}
        <Button disabled={busy} onClick={() => void shareAndStart()} className="self-start">Share entire screen</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-6 text-base">
      <h1 className="text-xl font-semibold">ICU privacy notice: exam monitoring</h1>
      {session && (
        <p className="text-sm text-muted">
          Exam: {session.name} · {formatTime(session.starts_at)} – {formatTime(session.ends_at)} · Examiner: {examiner}
        </p>
      )}
      {session && (
        <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
          <ExamAbout session={session} />
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">What we collect</h2>
        <p>Only between the moment you click Start and the end of the exam:</p>
        <ul className="list-disc pl-6">
          <li>Screenshots of your <strong>entire screen</strong> every minute, when a warning is shown, and when another website is on screen. They show everything visible on your screen, including other apps, which may include personal information.</li>
          <li>When you leave and return to the exam tab or the browser window, and how long you were away.</li>
          <li>New tabs you open, and the addresses of pages you view, as site and page only (for example chatgpt.com/c). Never search terms, form data or anything after a “?”.</li>
          <li>When you copy, cut, paste or right-click on the exam page. Never what you copied or pasted.</li>
          <li>When the exam window enters or leaves fullscreen. ICU switches you to your exam tab and makes the window fullscreen when you click Start (or, if the exam page isn’t open yet, when you open it).</li>
          <li>When screen sharing starts or stops, a heartbeat every 15 seconds showing that monitoring is on, and the times of any warnings shown to you.</li>
          <li>Your name and email from your account, and when you agreed to this notice.</li>
        </ul>
        <p>We do not use your camera or microphone, and we do not record keystrokes or audio.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Sharing your screen</h2>
        <p>
          When you click Start, Chrome asks you to share your <strong>entire screen</strong>. The exam can't start without it. This tab then stays open as
          “ICU monitoring” until the exam ends. On a Mac, you may first need to allow Chrome under System Settings → Privacy &amp; Security → Screen Recording.
        </p>
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
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read this notice and agree to this monitoring, including sharing my entire screen
      </label>
      {error && <Alert>{error}</Alert>}
      <Button disabled={!adult || !agree || busy} onClick={() => void shareAndStart()} className="self-start">
        {busy ? 'Waiting for screen sharing…' : 'Share screen and start'}
      </Button>
    </main>
  );
}
