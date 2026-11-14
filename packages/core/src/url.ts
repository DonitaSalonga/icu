// Exam URL matching (R9) and URL minimisation (R11, R26). SDD.md § packages/core functions.

const PATTERN_RE = /^(\*|https?):\/\/([^/]+)(\/.*)?$/i;

function globToRegex(glob: string, star: string): string {
  return glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join(star);
}

/** Returns true if the pattern is syntactically valid (`scheme://host/path`). */
export function isValidExamPattern(pattern: string): boolean {
  return PATTERN_RE.test(pattern.trim());
}

// ---------------------------------------------------------------------------
// Exam platforms (what the admin types, 2026-11-15). Three forms, all case-insensitive:
//   keyword   `netacad`               → any host with a dot-separated label equal to it
//                                        (netacad.com, www.netacad.com, skillsforall.netacad.com;
//                                         NOT netacad-answers.blogspot.com)
//   domain    `skillsbuild.org`       → that host or any subdomain of it
//   domain+path `docs.google.com/forms` → that host (or subdomain) and paths starting with /forms
// Full patterns with a scheme (`https://host/path*`) keep their glob meaning.
// ---------------------------------------------------------------------------

const KEYWORD_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN_RE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\.)+[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Cleans what the admin typed: lowercase, no scheme, no leading www., no query, no trailing slash. */
export function normalizeExamSite(input: string): string {
  let v = input.trim().toLowerCase();
  if (/^(\*|https?):\/\//.test(v) && v.includes('*')) return input.trim(); // explicit glob pattern
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[?#]/)[0] ?? '';
  return v.replace(/\/+$/, '');
}

type Site = { kind: 'keyword'; keyword: string } | { kind: 'domain'; domain: string; path: string } | { kind: 'glob'; pattern: string };

function parseSite(entry: string): Site | undefined {
  const v = entry.trim();
  if (v.includes('://')) return PATTERN_RE.test(v) ? { kind: 'glob', pattern: v } : undefined;
  const lower = v.toLowerCase();
  if (KEYWORD_RE.test(lower)) return { kind: 'keyword', keyword: lower };
  const slash = lower.indexOf('/');
  const domain = slash < 0 ? lower : lower.slice(0, slash);
  const path = slash < 0 ? '' : lower.slice(slash).replace(/\/+$/, '');
  if (!DOMAIN_RE.test(domain) || /\s/.test(path)) return undefined;
  return { kind: 'domain', domain, path };
}

export function isValidExamSite(entry: string): boolean {
  return parseSite(entry) !== undefined;
}

/** Short human description for the admin, e.g. "pages on netacad.com and its subdomains". */
export function describeExamSite(entry: string): string {
  const s = parseSite(entry);
  if (!s) return 'not a valid website or platform name';
  if (s.kind === 'glob') return `pages matching ${s.pattern}`;
  if (s.kind === 'keyword') return `any website named “${s.keyword}” (e.g. ${s.keyword}.com, www.${s.keyword}.com, learn.${s.keyword}.org)`;
  return s.path ? `${s.domain}${s.path} pages (and its subdomains)` : `all pages on ${s.domain} and its subdomains`;
}

function matchSite(url: URL, site: Site): boolean {
  const host = url.hostname.toLowerCase();
  if (site.kind === 'keyword') return host.split('.').includes(site.keyword);
  if (site.kind === 'domain') {
    const hostOk = host === site.domain || host.endsWith(`.${site.domain}`);
    const path = url.pathname.toLowerCase();
    return hostOk && (site.path === '' || path === site.path || path.startsWith(`${site.path}/`) || path.startsWith(site.path));
  }
  return false;
}

/**
 * Matches a URL against exam patterns of the form `scheme://host/path`.
 * `*` matches any run of characters within the host or path; the scheme is
 * `http`, `https` or `*`; the query and fragment are ignored; a missing path matches any path.
 */
export function matchExamUrl(url: string, patterns: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return false;
  const host = parsed.host.toLowerCase();
  const path = parsed.pathname;

  return patterns.some((raw) => {
    const site = parseSite(raw);
    if (site && site.kind !== 'glob') return matchSite(parsed, site);
    const m = PATTERN_RE.exec(raw.trim());
    if (!m) return false;
    const [, pScheme = '', pHost = '', pPath] = m;
    if (pScheme !== '*' && pScheme.toLowerCase() !== scheme) return false;
    const hostRe = new RegExp(`^${globToRegex(pHost.toLowerCase(), '[^/]*')}$`);
    if (!hostRe.test(host)) return false;
    if (pPath === undefined) return true;
    // Query and fragment in the pattern are ignored, like in the URL.
    const cleanPath = pPath.split(/[?#]/)[0] ?? '';
    const pathRe = new RegExp(`^${globToRegex(cleanPath, '.*')}$`);
    return pathRe.test(path);
  });
}

export interface SanitizedUrl {
  host: string;
  path: string;
}

/** Keeps only host and path: drops credentials, query string and fragment (R11, R26). */
export function sanitizeUrl(url: string): SanitizedUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { host: 'invalid', path: '' };
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return { host: scheme, path: '' };
  return { host: parsed.host.toLowerCase(), path: parsed.pathname };
}
