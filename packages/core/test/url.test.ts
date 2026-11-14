import { describe, expect, it } from 'vitest';
import { isValidExamPattern, matchExamUrl, sanitizeUrl } from '../src/url';

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
