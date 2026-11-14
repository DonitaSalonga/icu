import { describe, expect, it } from 'vitest';
import { describeExamSite, isValidExamPattern, isValidExamSite, matchExamUrl, normalizeExamSite, sanitizeUrl } from '../src/url';

// T1 (R9)
describe('matchExamUrl', () => {
  const forms = ['https://docs.google.com/forms/*'];
  it.each([
    ['exact host and path wildcard', 'https://docs.google.com/forms/d/e/abc/viewform', forms, true],
    ['query and fragment are ignored', 'https://docs.google.com/forms/d/x/viewform?usp=sf#q2', forms, true],
    ['different path', 'https://docs.google.com/document/d/x', forms, false],
    ['different host', 'https://chatgpt.com/forms/x', forms, false],
    ['scheme must match', 'http://docs.google.com/forms/x', forms, false],
    ['wildcard scheme', 'http://docs.google.com/forms/x', ['*://docs.google.com/forms/*'], true],
    ['host wildcard', 'https://eu.quiz.example.com/a', ['https://*.example.com/*'], true],
    ['host wildcard does not cross path', 'https://evil.com/x.example.com/a', ['https://*.example.com/*'], false],
    ['missing path matches any path', 'https://lms.example.edu/course/1/quiz', ['https://lms.example.edu'], true],
    ['host is case-insensitive', 'https://DOCS.google.com/forms/x', forms, true],
    ['port must match host', 'http://localhost:4173/exam/form.html', ['http://localhost:4173/exam/*'], true],
    ['wrong port', 'http://localhost:5000/exam/form.html', ['http://localhost:4173/exam/*'], false],
    ['chrome:// never matches', 'chrome://extensions', ['*://*/*'], false],
    ['invalid url', 'not a url', forms, false],
    ['invalid pattern is ignored', 'https://docs.google.com/forms/x', ['docs.google.com/forms/*'], false],
    ['any of several patterns', 'https://www.coursera.org/learn/x/quiz/1', [...forms, 'https://www.coursera.org/*'], true],
    ['regex characters are literal', 'https://aXb.com/', ['https://a.b.com/'], false],
  ])('%s', (_name, url, patterns, expected) => {
    expect(matchExamUrl(url, patterns)).toBe(expected);
  });

  it('validates pattern syntax', () => {
    expect(isValidExamPattern('https://docs.google.com/forms/*')).toBe(true);
    expect(isValidExamPattern('*://*.example.com')).toBe(true);
    expect(isValidExamPattern('docs.google.com/forms')).toBe(false);
    expect(isValidExamPattern('ftp://x.com/')).toBe(false);
  });
});

// T2 (R11, R26)
describe('sanitizeUrl', () => {
  it.each([
    ['https://chatgpt.com/c/123?model=x#top', { host: 'chatgpt.com', path: '/c/123' }],
    ['https://user:pass@example.com:8443/a/b?q=1', { host: 'example.com:8443', path: '/a/b' }],
    ['http://LOCALHOST:4173/other/page.html?secret=1#x', { host: 'localhost:4173', path: '/other/page.html' }],
    ['chrome://settings/passwords', { host: 'chrome', path: '' }],
    ['file:///Users/me/answers.txt', { host: 'file', path: '' }],
    ['garbage', { host: 'invalid', path: '' }],
  ])('%s', (url, expected) => {
    const out = sanitizeUrl(url);
    expect(out).toEqual(expected);
    expect(JSON.stringify(out)).not.toMatch(/[?#@]/);
  });
});

// Exam platforms typed by the admin (2026-11-15; T1 extended)
describe('exam platforms', () => {
  it.each([
    ['keyword matches the platform', 'https://www.netacad.com/launch?id=1', ['netacad'], true],
    ['keyword matches subdomains', 'https://skillsforall.netacad.com/course/x', ['netacad'], true],
    ['keyword matches other TLDs', 'https://learn.ibm.org/exam', ['ibm'], true],
    ['keyword does not match answer sites that only mention it', 'https://netacad-answers.blogspot.com/quiz', ['netacad'], false],
    ['keyword does not match the path', 'https://quizlet.com/netacad/answers', ['netacad'], false],
    ['keyword does not match a longer word', 'https://notibm.com/', ['ibm'], false],
    ['domain matches itself and subdomains', 'https://www.skillsbuild.org/test', ['skillsbuild.org'], true],
    ['domain does not match a look-alike', 'https://skillsbuild.org.evil.com/', ['skillsbuild.org'], false],
    ['domain+path limits to the path', 'https://docs.google.com/forms/d/e/x/viewform', ['docs.google.com/forms'], true],
    ['domain+path excludes Google Docs', 'https://docs.google.com/document/d/x', ['docs.google.com/forms'], false],
    ['domain+path excludes Google Search', 'https://www.google.com/search?q=answers', ['docs.google.com/forms'], false],
    ['keyword google would include search (why paths exist)', 'https://www.google.com/search?q=x', ['google'], true],
    ['localhost keyword (tests)', 'http://localhost:4173/exam/form.html', ['localhost'], true],
    ['old glob patterns still work', 'https://docs.google.com/forms/x', ['https://docs.google.com/forms/*'], true],
  ])('%s', (_n, url, entries, expected) => {
    expect(matchExamUrl(url, entries)).toBe(expected);
  });

  it('normalises and validates what the admin types', () => {
    expect(normalizeExamSite('  https://www.NetAcad.com/ ')).toBe('netacad.com');
    expect(normalizeExamSite('Docs.Google.com/forms/?usp=x')).toBe('docs.google.com/forms');
    expect(normalizeExamSite('NETACAD')).toBe('netacad');
    for (const ok of ['netacad', 'ibm', 'skillsbuild.org', 'docs.google.com/forms', 'https://*.example.com/*']) expect(isValidExamSite(ok)).toBe(true);
    for (const bad of ['', 'two words', 'exam!', '.com', 'http://']) expect(isValidExamSite(bad)).toBe(false);
    expect(describeExamSite('skillsbuild.org')).toBe('all pages on skillsbuild.org and its subdomains');
  });
});
