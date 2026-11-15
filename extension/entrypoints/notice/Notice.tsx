// Privacy & terms popout (design "Extension · Privacy & terms"; R7, R26, D9). Opened by the popup's Continue in a
// small `type: 'popup'` window. The notice is written for the Philippine Data Privacy Act of 2012 (RA 10173) and
// the NPC education-sector advisory (RESEARCH F23); every item listed must match what the extension collects
// (QAD T45), and any wording change bumps NOTICE_VERSION in packages/core. After Start this page holds the
// whole-screen share and stays open as the "ICU monitoring" window, behind the fullscreen exam (RESEARCH F32).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@icu/ui-tokens/icons';
import { NOTICE_VERSION, type AttemptStatus } from '@icu/core';
import { requestScreenShare, serveFrames } from '../../lib/screen';
import { errorText, send } from '../../lib/send';

const reshare = new URLSearchParams(location.search).has('reshare');

/** The popout card: fills the small window, as in the design board (16 px margin, 28 px corners). */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rise" style={{ width: '100%', height: '100vh', overflow: 'hidden', background: 'var(--bg)', padding: 16 }}>
      <div className="card" style={{ height: '100%', padding: 0, display: 'flex', flexDirection: 'column', borderRadius: 28, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

const big = { fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 8 } as const;

export function Notice() {
  const [status, setStatus] = useState<AttemptStatus>();
  const [adult, setAdult] = useState(false);
  const [agree, setAgree] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [prog, setProg] = useState(0);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'notice' | 'mon' | 'end'>('notice');
  const stopRef = useRef<() => void>();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void send<AttemptStatus>({ type: 'attempt.status' }).then((res) => res.ok && setStatus(res.data));
    const onMessage = (m: { type?: string }) => {
      if (m?.type === 'monitor.stop') {
        stopRef.current?.();
        stopRef.current = undefined;
        setView('end');
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  // R7: agreeing unlocks once the notice has been read to the end; a notice that fits needs no scrolling.
  const measure = (el: HTMLDivElement) => {
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? el.scrollTop / max : 1;
    setProg(p);
    if (p > 0.985) setAtEnd(true);
  };
  useEffect(() => {
    if (bodyRef.current && view === 'notice') measure(bodyRef.current);
  }, [status, view]);

  // While monitoring, keep the exam-tab status fresh.
  useEffect(() => {
    if (view !== 'mon') return;
    const refresh = () => void send<AttemptStatus>({ type: 'attempt.status' }).then((res) => res.ok && setStatus(res.data));
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [view]);

  useEffect(() => {
    document.title = view === 'mon' ? 'ICU monitoring · keep this window open' : view === 'end' ? 'Exam ended · ICU' : reshare ? 'Share your screen · ICU' : 'Privacy & terms · ICU: I Caught You';
  }, [view]);

  /** Q36/Q37: the exam starts only with the entire screen shared. */
  const shareAndStart = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const stream = await requestScreenShare();
      stopRef.current = serveFrames(stream, () => void send({ type: 'screen.stopped' }));
      const shared = await send({ type: 'screen.started' });
      if (!shared.ok) throw new Error(shared.code);
      if (!reshare) {
        const res = await send({ type: 'attempt.start', age_confirmed: adult, consent_version: NOTICE_VERSION });
        if (!res.ok) throw new Error(res.code);
      }
      setView('mon');
    } catch (e) {
      stopRef.current?.();
      stopRef.current = undefined;
      setError(errorText(e instanceof Error ? e.message : String(e), ''));
    } finally {
      setBusy(false);
    }
  };

  const endExam = async () => {
    if (!window.confirm('End the exam now?')) return;
    const res = await send({ type: 'attempt.end' });
    if (!res.ok) setError(errorText(res.code, res.message));
  };

  if (view === 'end') {
    return (
      <Frame>
        <div style={{ padding: '32px 28px' }}>
          <h1 style={big}>Exam ended.</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Your examiner will review the session. You can close this window.</p>
          <button type="button" className="btn p" style={{ width: '100%' }} onClick={() => window.close()}>Close window</button>
        </div>
      </Frame>
    );
  }

  if (view === 'mon') {
    return (
      <Frame>
        <div style={{ padding: '32px 28px' }}>
          <span className="pill live" style={{ marginBottom: 16 }}><span className="dot" />Monitoring</span>
          <h1 style={{ ...big, marginTop: 16 }}>ICU monitoring</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{status?.exam_tab_bound ? 'Your exam is open in another window.' : 'Now open your exam in this browser.'}</p>
          {error && <p className="err" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
          <button type="button" className="btn p" style={{ width: '100%', marginBottom: 12 }} disabled={!status?.exam_tab_bound} onClick={() => void send({ type: 'attempt.focusExam' }).then((res) => !res.ok && setError(errorText(res.code, res.message)))}>
            <Icon name="monitor" size={18} /> Go to my exam
          </button>
          <button type="button" className="btn s" style={{ width: '100%' }} onClick={() => void endExam()}>End exam</button>
          <p className="hint" style={{ marginTop: 16 }}>Screen sharing is on. Keep this window open until the exam ends.</p>
        </div>
      </Frame>
    );
  }

  const session = status?.session;
  const examiner = session ? `${session.admin_name} (${session.admin_email})` : 'your examiner';

  if (reshare) {
    return (
      <Frame>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 14px' }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>Share your screen again</h1>
          <button type="button" className="iconbtn" style={{ margin: 0 }} aria-label="Cancel and close" onClick={() => window.close()}><Icon name="close" /></button>
        </div>
        <div className="nb"><p>Your exam requires sharing your entire screen. Choose your screen in the window Chrome opens.</p></div>
        <div style={{ padding: '14px 24px 20px' }}>
          {error && <p className="err" role="alert" style={{ margin: '0 0 8px' }}>{error}</p>}
          <div className="actions" style={{ margin: 0 }}>
            <button type="button" className="btn s" onClick={() => window.close()}>Cancel</button>
            <button type="button" className="btn p" disabled={busy} onClick={() => void shareAndStart()}>Share entire screen</button>
          </div>
        </div>
      </Frame>
    );
  }

  const ok = atEnd && adult && agree && !busy;
  const hint = busy ? 'Waiting for screen sharing…' : !atEnd ? 'Scroll to the end to continue' : !adult || !agree ? 'Tick both boxes to continue' : 'Ready when you are';
  return (
    <Frame>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 14px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>Privacy &amp; terms</h1>
        <button type="button" className="iconbtn" style={{ margin: 0 }} aria-label="Cancel and close" onClick={() => window.close()}><Icon name="close" /></button>
      </div>
      <div style={{ position: 'relative' }}><div className="prog" style={{ transform: `scaleX(${prog})` }} /></div>
      <div ref={bodyRef} className="nb" role="document" tabIndex={0} aria-label="Privacy notice text" onScroll={(e) => measure(e.currentTarget)}>
        <section>
          <h2 className="nh">What we collect</h2>
          <p>Only between the moment you click Start and the end of the exam:</p>
          <ul>
            <li>Screenshots of your <strong>entire screen</strong> every minute, when a warning is shown, when another website is on screen, and when you switch tabs. They show everything visible on your screen, including other apps, which may include personal information.</li>
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
          <h2 className="nh">Sharing your screen</h2>
          <p>When you click Start, Chrome asks you to share your <strong>entire screen</strong>. The exam can't start without it. This window then stays open as “ICU monitoring”, behind your exam, until the exam ends. On a Mac, you may first need to allow Chrome under System Settings → Privacy &amp; Security → Screen Recording.</p>
        </section>
        <section>
          <h2 className="nh">Why</h2>
          <p>To help your examiner check that the exam was taken fairly. The tool only records and flags activity; it never ends your exam or decides that you cheated. A person reviews every flag.</p>
          <p>An automated system analyses an anonymous summary of this activity (without your name or email) and suggests a result to your examiner. The suggestion can be wrong; your examiner always makes the final decision.</p>
        </section>
        <section>
          <h2 className="nh">Who can see it</h2>
          <p>Only the examiner who created this exam: {examiner}. The data is stored with our hosting provider, Supabase, on servers in Singapore.</p>
        </section>
        <section>
          <h2 className="nh">How long we keep it</h2>
          <p>Monitoring data and screenshots are deleted automatically 30 days after the exam ends. Your examiner can delete them sooner.</p>
        </section>
        <section>
          <h2 className="nh">Your rights</h2>
          <p>Under the Data Privacy Act of 2012 you have the right to be informed, to access your data, to have it corrected, to object, to have it erased or blocked, and to file a complaint with the National Privacy Commission. To use these rights, or to ask for your data to be deleted, contact {examiner}.</p>
          <p>If you use a screen reader or another assistive tool, tell your examiner before you start: it may trigger focus or paste events.</p>
        </section>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Notice version {NOTICE_VERSION}</p>
      </div>
      <div style={{ padding: '14px 24px 20px' }}>
        <label className="cb"><input type="checkbox" checked={adult} onChange={() => setAdult(!adult)} /><span>I am 18 or older</span></label>
        <label className="cb"><input type="checkbox" checked={agree} onChange={() => setAgree(!agree)} /><span>I have read this notice and agree to this monitoring, including sharing my entire screen</span></label>
        {error ? <p className="err" role="alert" style={{ margin: '0 0 8px' }}>{error}</p> : <p className="hint" style={{ minHeight: 22, margin: '0 0 8px' }}>{hint}</p>}
        <div className="actions" style={{ margin: 0 }}>
          <button type="button" className="btn s" onClick={() => window.close()}>Cancel</button>
          <button type="button" className="btn p" disabled={!ok} onClick={() => void shareAndStart()}>I agree &amp; share screen</button>
        </div>
      </div>
    </Frame>
  );
}
