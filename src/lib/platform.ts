import { createContext, useContext } from 'react';

export type PlatformType = 'desktop' | 'mobile';

export interface PlatformInfo {
  type: PlatformType;
  os: string;
  isMobile: boolean;
  isDesktop: boolean;
  isAndroid: boolean;
  isWindows: boolean;
  canUseHotkeys: boolean;
  canUsePillWindow: boolean;
  canUseSystemTray: boolean;
}

const DEFAULT_PLATFORM: PlatformInfo = {
  type: 'desktop',
  os: 'windows',
  isMobile: false,
  isDesktop: true,
  isAndroid: false,
  isWindows: true,
  canUseHotkeys: true,
  canUsePillWindow: true,
  canUseSystemTray: true,
};

export const PlatformContext = createContext<PlatformInfo>(DEFAULT_PLATFORM);

export function usePlatform(): PlatformInfo {
  return useContext(PlatformContext);
}

/**
 * Detect the current platform.
 * Uses Tauri OS plugin when available, falls back to navigator userAgent.
 */
export async function detectPlatform(): Promise<PlatformInfo> {
  let os = 'unknown';

  try {
    const { platform } = await import('@tauri-apps/plugin-os');
    os = platform();
  } catch {
    // Fallback: sniff from userAgent for dev/browser usage
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) os = 'android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'ios';
    else if (ua.includes('win')) os = 'windows';
    else if (ua.includes('mac')) os = 'macos';
    else if (ua.includes('linux')) os = 'linux';
  }

  const isMobile = os === 'android' || os === 'ios';
  const isDesktop = !isMobile;

  return {
    type: isMobile ? 'mobile' : 'desktop',
    os,
    isMobile,
    isDesktop,
    isAndroid: os === 'android',
    isWindows: os === 'windows',
    canUseHotkeys: isDesktop,
    canUsePillWindow: isDesktop,
    canUseSystemTray: isDesktop,
  };
}
