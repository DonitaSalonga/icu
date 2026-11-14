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
