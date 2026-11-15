// The seven scenes (user, 2026-11-15). Each gets `b(j)`: the frame of its j-th beat, counted from the
// scene's start, so every move lands on the music. Data is sample data, not real students.
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { avatarFor } from '@icu/ui-tokens/avatars';
import { Icon, Logo } from '@icu/ui-tokens/icons';
import { Caption, Glow, Pointer, Rise, Typed, useEnter, usePress, useProgress, Window } from './ui';

export type Beat = (j: number) => number;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const CODE = 'K7QM2P';
const STUDENT = 'Juan Dela Cruz';

const center = { alignItems: 'center', justifyContent: 'center' } as const;

// 1 · Logo and tagline.
export function Intro({ b }: { b: Beat }) {
  const logo = useEnter(b(0), 26);
  return (
    <AbsoluteFill style={center}>
      <Glow color="yellow" x={960} y={540} size={1000} />
      <div style={{ display: 'grid', justifyItems: 'center', gap: 26, position: 'relative' }}>
        <div style={{ opacity: logo, transform: `scale(${0.92 + 0.08 * logo})` }}><Logo height={170} /></div>
        <Rise at={b(2)}><p style={{ fontSize: 34, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>I Caught You</p></Rise>
        <Rise at={b(4)}><p style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--ink)' }}>It catches the tab switch. A person makes the call.</p></Rise>
      </div>
    </AbsoluteFill>
  );
}

// 2 · The examiner creates a session; the code appears.
export function CreateSession({ b }: { b: Beat }) {
  const frame = useCurrentFrame();
  const press = usePress(b(5));
  const created = frame >= b(5.5);
  return (
    <AbsoluteFill style={center}>
      <Glow color="pink" x={1300} y={620} />
      <Caption step={1} text="The examiner creates an exam session" />
      <Rise at={b(0)} style={{ marginTop: 120 }}>
        <Window width={1120} height={560} scale={1.3} url="icu-dashboard-ten.vercel.app/sessions">
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: 210, padding: 18, borderRight: '1px solid var(--line)', background: 'var(--bg)', display: 'grid', alignContent: 'start', gap: 6 }}>
              <div style={{ padding: '2px 6px 14px' }}><Logo height={26} /></div>
              {['Overview', 'Sessions', 'Needs review'].map((n) => (
                <div key={n} className="nav" aria-current={n === 'Sessions' ? 'page' : undefined} style={{ height: 38, fontSize: 14 }}>{n}</div>
              ))}
            </div>
            <div style={{ flex: 1, padding: '26px 30px', position: 'relative' }}>
              <h1 className="h1" style={{ fontSize: 34 }}>Sessions</h1>
              <div className="card" style={{ position: 'absolute', left: 150, top: 70, width: 560, padding: 26, boxShadow: '0 24px 60px rgba(60,40,20,.18)' }}>
                {!created ? (
                  <>
                    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Create session</h2>
                    <div className="field"><label>Name</label><div className="in" style={{ display: 'flex', alignItems: 'center' }}><Typed text="CCNA 1 Final Exam" from={b(1)} to={b(2.5)} /></div></div>
                    <div className="field"><label>Exam platform</label><div className="in" style={{ display: 'flex', alignItems: 'center' }}><Typed text="netacad" from={b(2.5)} to={b(3.5)} /></div></div>
                    <div className="field"><label>Date and time</label><div className="in" style={{ display: 'flex', alignItems: 'center', color: frame >= b(4) ? 'var(--ink)' : 'transparent' }}>Nov 20, 2026 · 9:00 – 10:30 AM</div></div>
                    <div className="btn p" style={{ width: '100%', transform: `scale(${press})` }}><Icon name="plus" size={18} /> Create session</div>
                  </>
                ) : (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <span className="pill live" style={{ justifySelf: 'start' }}><span className="dot" /> Session created</span>
                    <h2 style={{ fontSize: 26, fontWeight: 700 }}>CCNA 1 Final Exam</h2>
                    <p style={{ color: 'var(--muted)' }}>Give students this code:</p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {CODE.split('').map((c, i) => {
                        const p = interpolate(frame, [b(6) + i * 2.5, b(6) + i * 2.5 + 8], [0, 1], clamp);
                        return <span key={i} style={{ width: 58, height: 70, borderRadius: 14, background: 'var(--soft)', color: 'var(--soft-ink)', display: 'grid', placeItems: 'center', fontSize: 36, fontWeight: 700, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>{c}</span>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Window>
      </Rise>
    </AbsoluteFill>
  );
}

// 3 · The student enters the code in the extension and shares the screen.
export function StudentJoin({ b }: { b: Beat }) {
  const frame = useCurrentFrame();
  const found = frame >= b(4);
  const findPress = usePress(b(3.5));
  const agreePress = usePress(b(6));
  const monitoring = frame >= b(6.5);
  return (
    <AbsoluteFill style={center}>
      <Glow color="sage" x={760} y={600} />
      <Caption step={2} text="The student joins with the code and shares the screen" />
      <Rise at={b(0)} style={{ marginTop: 120 }}>
        <div style={{ width: 460, transform: 'scale(1.6)', transformOrigin: 'center', background: 'var(--surface)', borderRadius: 22, padding: 26, border: '1px solid var(--line)', boxShadow: '0 30px 80px rgba(60,40,20,.16)', display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Logo height={22} /><span style={{ fontSize: 13, color: 'var(--muted)' }}>I Caught You</span></div>
          {!found ? (
            <>
              <h2 style={{ fontSize: 24, fontWeight: 700 }}>Join an exam</h2>
              <div>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Exam code</p>
                <div className="otp-slots">
                  {CODE.split('').map((c, i) => {
                    const at = b(1) + i * 3.5;
                    const shown = frame >= at;
                    const isNext = frame >= at - 3.5 && !shown;
                    return <div key={i} className={`otp-slot ${isNext ? 'on' : ''}`} style={{ fontSize: 22, fontWeight: 700 }}>{shown ? c : ''}</div>;
                  })}
                </div>
              </div>
              <div className="btn p" style={{ width: '100%', transform: `scale(${findPress})` }}>Find exam</div>
            </>
          ) : !monitoring ? (
            <Rise at={b(4)} distance={10}>
              <div style={{ display: 'grid', gap: 12 }}>
                <span className="pill live" style={{ justifySelf: 'start' }}><span className="dot" /> Open now</span>
                <h2 style={{ fontSize: 24, fontWeight: 700 }}>CCNA 1 Final Exam</h2>
                <p style={{ color: 'var(--muted)', fontSize: 15 }}>Exam platform: netacad · Nov 20, 9:00 AM</p>
                <div style={{ padding: 14, borderRadius: 14, background: 'var(--bg)', fontSize: 14, color: 'var(--muted)' }}>ICU records tab switches, other sites and screenshots during this exam only.</div>
                <div className="btn p" style={{ width: '100%', transform: `scale(${agreePress})` }}>I agree & share screen</div>
              </div>
            </Rise>
          ) : (
            <Rise at={b(6.5)} distance={10}>
              <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
                <span className="pill live"><span className="dot" /> Monitoring</span>
                <h2 style={{ fontSize: 24, fontWeight: 700 }}>CCNA 1 Final Exam</h2>
                <p style={{ color: 'var(--muted)', fontSize: 15 }}>Your screen is shared. Good luck!</p>
              </div>
            </Rise>
          )}
        </div>
      </Rise>
    </AbsoluteFill>
  );
}

// 4 · The student switches to ChatGPT: a screenshot is taken, and the warning shows on return.
export function TabSwitch({ b }: { b: Beat }) {
  const frame = useCurrentFrame();
  const onChat = frame >= b(3) && frame < b(7);
  // Pointer: to the ChatGPT tab, click on beat 3; back to the exam tab, click on beat 7.
  const px = interpolate(frame, [b(1), b(3), b(5), b(7)], [900, 330, 330, 120], clamp);
  const py = interpolate(frame, [b(1), b(3), b(5), b(7)], [520, 18, 18, 18], clamp);
  const down = Math.abs(frame - b(3)) < 3 || Math.abs(frame - b(7)) < 3;
  const flash = interpolate(frame, [b(4), b(4) + 3, b(4) + 14], [0, 0.85, 0], clamp);
  const shot = useEnter(b(4.5), 20);
  const banner = useEnter(b(7.5), 16);
  return (
    <AbsoluteFill style={center}>
      <Glow color="blue" x={1000} y={600} size={1100} />
      <Caption step={3} text="Every tab switch is caught and captured" />
      <Rise at={b(0)} style={{ marginTop: 120, position: 'relative' }}>
        <Window width={1240} height={600} scale={1.2} tabs={['NetAcad · CCNA 1 Final', 'ChatGPT']} active={onChat ? 1 : 0} url={onChat ? 'chatgpt.com' : 'netacad.com/exam/ccna1-final'}>
          {!onChat ? (
            <div style={{ padding: '40px 70px', display: 'grid', gap: 18 }}>
              <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Question 12 of 60</p>
              <h2 style={{ fontSize: 28, fontWeight: 700, maxWidth: 820 }}>Which layer of the OSI model is responsible for logical addressing and routing?</h2>
              {['Data link layer', 'Network layer', 'Transport layer', 'Session layer'].map((o) => (
                <div key={o} className="radio" style={{ maxWidth: 520, fontSize: 18 }}><span style={{ width: 18, height: 18, borderRadius: 99, border: '2px solid var(--line-strong)' }} />{o}</div>
              ))}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#fff' }}>
              <div style={{ display: 'grid', gap: 22, justifyItems: 'center' }}>
                <p style={{ fontSize: 30, fontWeight: 600, color: '#222' }}>What can I help with?</p>
                <div style={{ width: 640, height: 58, borderRadius: 30, border: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '0 24px', color: '#333', fontSize: 18 }}>
                  <Typed text="which OSI layer handles routing" from={b(3.5)} to={b(5.5)} />
                </div>
              </div>
            </div>
          )}
          {/* The ICU warning banner, as the extension shows it on the exam page. */}
          <div style={{ position: 'absolute', top: 14, left: '50%', width: 560, transform: `translate(-50%, ${(1 - banner) * -140}%)`, opacity: banner, display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 16, background: '#faefc5', color: '#7a5200', borderLeft: '4px solid #7a5200', boxShadow: '0 6px 16px rgb(28 25 23 / .08)', fontSize: 15 }}>
            <span><b>Warning 1 of 3:</b> You left the exam tab.</span>
          </div>
          <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash, pointerEvents: 'none' }} />
          <Pointer x={px} y={py} down={down} />
        </Window>
        {/* The screenshot ICU took, settling in the corner. */}
        <div style={{ position: 'absolute', right: -40, bottom: -30, opacity: shot, transform: `translateY(${(1 - shot) * 30}px) rotate(${(1 - shot) * 3}deg)`, background: 'var(--surface)', borderRadius: 16, padding: 10, boxShadow: '0 20px 50px rgba(60,40,20,.2)', display: 'grid', gap: 8, width: 290 }}>
          <div style={{ height: 150, borderRadius: 10, background: '#fff', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: '#555', fontSize: 13 }}>What can I help with?</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}><Icon name="camera" size={18} /> Screenshot saved · 9:14:08</span>
        </div>
      </Rise>
    </AbsoluteFill>
  );
}

const FINDINGS: { text: string; icon: 'alert' | 'camera' | 'external' | 'copy'; alert?: boolean }[] = [
  { text: 'Warning limit reached · High regardless of score', icon: 'alert', alert: true },
  { text: 'Left the exam tab 3 times', icon: 'camera' },
  { text: 'Visited chatgpt.com', icon: 'external' },
  { text: 'Pasted once', icon: 'copy' },
];
const TIMELINE: [string, string, 'monitor' | 'camera' | 'external' | 'copy', boolean][] = [
  ['9:12:40', 'Entered fullscreen', 'monitor', false],
  ['9:14:08', 'Left exam tab', 'camera', true],
  ['9:14:09', 'Visited chatgpt.com', 'external', true],
  ['9:14:41', 'Returned to exam tab · away 32 s', 'camera', false],
  ['9:15:02', 'Pasted on exam page', 'copy', true],
];

// 5 · The examiner reviews the candidate: risk, findings, timeline.
export function Review({ b }: { b: Beat }) {
  const frame = useCurrentFrame();
  const pill = useEnter(b(1), 14);
  return (
    <AbsoluteFill style={center}>
      <Glow color="yellow" x={700} y={700} />
      <Caption step={4} text="The examiner sees exactly what happened" />
      <Rise at={b(0)} style={{ marginTop: 120 }}>
        <Window width={1240} height={620} scale={1.2} url="icu-dashboard-ten.vercel.app/sessions/…/attempts/…">
          <div style={{ padding: '26px 34px', display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Img src={avatarFor('juan-dela-cruz')} style={{ width: 56, height: 56, borderRadius: 99 }} />
              <div style={{ flex: 1 }}>
                <h1 className="h1" style={{ fontSize: 34 }}>{STUDENT}</h1>
                <p style={{ color: 'var(--muted)', fontSize: 15 }}>CCNA 1 Final Exam · Ended 10:30 AM</p>
              </div>
              <span className="pill hi" style={{ fontSize: 18, padding: '6px 14px', opacity: pill, transform: `scale(${0.8 + 0.2 * pill})` }}><span className="sq" /> High · 21</span>
            </div>
            <div className="findings" style={{ margin: 0 }}>
              <span className="fl">Findings</span>
              <ul>
                {FINDINGS.map((f, i) => {
                  const p = interpolate(frame, [b(2 + i), b(2 + i) + 10], [0, 1], clamp);
                  return <li key={f.text} className={`fi ${f.alert ? 'alert' : ''}`} style={{ opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}><Icon name={f.icon} size={16} /> {f.text}</li>;
                })}
              </ul>
            </div>
            <div className="card" style={{ padding: '18px 24px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Timeline</h2>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {TIMELINE.map(([t, label, icon, shot], i) => {
                  const p = interpolate(frame, [b(6 + i * 0.75), b(6 + i * 0.75) + 9], [0, 1], clamp);
                  return (
                    <li key={t} className="tl" style={{ padding: '9px 0', opacity: p, transform: `translateX(${(1 - p) * -14}px)` }}>
                      <time>{t}</time>
                      <span className="ico"><Icon name={icon} size={18} /></span>
                      <span className="tx">{label}</span>
                      {shot && <span className="btn s sm" style={{ height: 30, fontSize: 13 }}>Screenshot</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </Window>
      </Rise>
    </AbsoluteFill>
  );
}

const PROBS: [string, number][] = [
  ['Likely cheating: used AI or the web', 0.82],
  ['Likely cheating: pasted outside content', 0.09],
  ['Needs review', 0.06],
  ['Likely fine', 0.03],
];

// 6 · The AI suggests; the examiner decides and saves the verdict.
export function Verdict({ b }: { b: Beat }) {
  const frame = useCurrentFrame();
  const bars = useProgress(b(0.5), b(2.5));
  const chosen = frame >= b(3);
  const save = usePress(b(4));
  const toast = useEnter(b(4.5), 14);
  return (
    <AbsoluteFill style={center}>
      <Glow color="pink" x={1250} y={650} />
      <Caption step={5} text="AI suggests. A person decides." at={2} />
      <Rise at={b(0)} style={{ marginTop: 120, position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26, width: 1080, transform: 'scale(1.35)', transformOrigin: 'center' }}>
          <section className="card">
            <div className="cardhead"><h2 style={{ fontSize: 22, fontWeight: 700 }}>AI suggestion</h2></div>
            <p style={{ fontWeight: 700, fontSize: 17, margin: '10px 0 14px' }}>Likely cheating: used AI or the web · 82%</p>
            <div className="probbox">
              {PROBS.map(([label, p], i) => (
                <div key={label}>
                  <div className="probrow"><span>{label}</span><b className="num">{Math.round(p * 100 * bars)}%</b></div>
                  <div className="bar"><i className={i === 0 ? '' : 'g'} style={{ width: `${p * 100 * bars}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 12 }}>A suggestion only. It can be wrong; your verdict is the decision.</p>
          </section>
          <section className="card">
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>Your verdict</h2>
            {['Cleared', 'Suspicious', 'Cheating confirmed'].map((v) => {
              const on = chosen && v === 'Cheating confirmed';
              return (
                <div key={v} className={`radio ${on ? 'on' : ''}`} style={{ fontSize: 17 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 99, border: `2px solid ${on ? 'var(--primary)' : 'var(--line-strong)'}`, boxShadow: on ? 'inset 0 0 0 4px var(--surface)' : undefined, background: on ? 'var(--primary)' : 'transparent' }} />
                  {v}
                </div>
              );
            })}
            <div className="btn p" style={{ width: '100%', marginTop: 8, opacity: chosen ? 1 : 0.5, transform: `scale(${save})` }}>Save verdict</div>
          </section>
        </div>
        <div className="icu-toast" style={{ position: 'absolute', right: -60, bottom: -110, opacity: toast, transform: `translateY(${(1 - toast) * 16}px) scale(1.35)` }}>
          <Icon name="check" size={18} /> Verdict saved.
        </div>
      </Rise>
    </AbsoluteFill>
  );
}

// 7 · Logo, live link, download, and the music credit (CC BY 4.0 requires it).
export function Outro({ b }: { b: Beat }) {
  return (
    <AbsoluteFill style={center}>
      <Glow color="sage" x={960} y={520} size={1000} />
      <div style={{ display: 'grid', justifyItems: 'center', gap: 22, position: 'relative' }}>
        <Rise at={b(0)}><Logo height={130} /></Rise>
        <Rise at={b(1)}><p style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-.02em' }}>Fair monitoring for online exams.</p></Rise>
        <Rise at={b(2)}>
          <div style={{ display: 'flex', gap: 18 }}>
            <span className="btn p" style={{ height: 60, fontSize: 22, padding: '0 28px' }}>icu-dashboard-ten.vercel.app</span>
            <span className="btn s" style={{ height: 60, fontSize: 22, padding: '0 28px' }}>Download the extension</span>
          </div>
        </Rise>
      </div>
      <p style={{ position: 'absolute', bottom: 34, fontSize: 18, color: 'var(--muted)' }}>Music: “Inspired” by Kevin MacLeod (incompetech.com) · Licensed under CC BY 4.0</p>
    </AbsoluteFill>
  );
}
