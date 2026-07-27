// Tells native (Capacitor/iOS) apart from the web build.
//
// Capacitor injects a global when the app runs inside the native shell. We read
// that global directly rather than importing @capacitor/core so the PWA bundle
// stays free of Capacitor code — every native-only module is loaded with a
// dynamic import behind an isNative() check.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

const cap = (): CapacitorGlobal | undefined =>
  typeof window === 'undefined' ? undefined : (window as any).Capacitor;

/** True only inside the native iOS/Android shell. False in any browser/PWA. */
export function isNative(): boolean {
  try {
    return cap()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** 'ios' | 'android' | 'web' */
export function platform(): string {
  try {
    return cap()?.getPlatform?.() ?? 'web';
  } catch {
    return 'web';
  }
}

// Custom URL scheme the native app registers, used as the OAuth redirect
// target. Must match CFBundleURLSchemes in ios/App/App/Info.plist and be
// allow-listed in Supabase → Authentication → URL Configuration.
export const NATIVE_URL_SCHEME = 'com.tracklylab.trackly';
export const NATIVE_AUTH_REDIRECT = `${NATIVE_URL_SCHEME}://auth`;
