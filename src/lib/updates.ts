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
    .split(/[.-]/)
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

export async function checkForGitHubUpdate(): Promise<ReleaseCheckResult> {
  const currentVersion = await getInstalledVersion();
  const response = await fetch(LATEST_RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub update check failed (${response.status})`);
  }

  const payload = await response.json() as {
    tag_name?: string;
    html_url?: string;
    published_at?: string;
    body?: string;
  };

  const latestVersion = payload.tag_name?.trim() || null;

  return {
    currentVersion,
    latestVersion,
    hasUpdate: latestVersion ? compareVersions(currentVersion, latestVersion) < 0 : false,
    htmlUrl: payload.html_url || RELEASES_PAGE_URL,
    publishedAt: payload.published_at || null,
    notes: payload.body?.trim() || '',
  };
}
