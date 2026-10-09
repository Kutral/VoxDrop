import { getVersion } from '@tauri-apps/api/app';

const GITHUB_OWNER = 'Kutral';
const GITHUB_REPO = 'VoxDrop';

export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export interface ReleaseCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  htmlUrl: string;
  publishedAt: string | null;
  notes: string;
}

export async function getInstalledVersion(): Promise<string> {
  return getVersion();
}

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    // "1.0.0-rc.1" compares as 1.0.0; pre-release tags never count as newer.
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function compareVersions(current: string, latest: string): number {
  const currentParts = normalizeVersion(current);
  const latestParts = normalizeVersion(latest);
  const maxLength = Math.max(currentParts.length, latestParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const latestPart = latestParts[index] ?? 0;

    if (latestPart > currentPart) return 1;
    if (latestPart < currentPart) return -1;
  }

  return 0;
}

/** Only ever open this repository's pages, whatever the API returns. */
function safeReleaseUrl(url: string | undefined): string {
  return url && url.startsWith(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/`) ? url : RELEASES_PAGE_URL;
}

export async function checkForGitHubUpdate(): Promise<ReleaseCheckResult> {
  const currentVersion = await getInstalledVersion();
  let response: Response;
  try {
    response = await fetch(LATEST_RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Couldn't reach GitHub. Check your connection and try again.");
  }

  if (response.status === 404) {
    // GitHub answers 404 while the newest release is still a draft.
    throw new Error('No published release found yet. Try again later.');
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub is limiting update checks right now. Try again in an hour.');
  }
  if (!response.ok) {
    throw new Error(`GitHub returned an error (${response.status}). Try again later.`);
  }

  const payload = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
    published_at?: string;
    body?: string;
  };

  const latestVersion = payload.tag_name?.trim() || null;

  return {
    currentVersion,
    latestVersion,
    hasUpdate: latestVersion ? compareVersions(currentVersion, latestVersion) > 0 : false,
    htmlUrl: safeReleaseUrl(payload.html_url),
    publishedAt: payload.published_at || null,
    notes: payload.body?.trim() || '',
  };
}
