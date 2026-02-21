/**
 * Google Authentication Service
 *
 * Uses Google Identity Services (GIS) authorization code flow with
 * server-side refresh tokens via Supabase Edge Functions.
 * Signs in once → stays connected forever (auto-refreshes).
 * Gracefully degrades when VITE_GOOGLE_CLIENT_ID is not set.
 */

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

const TOKEN_STORAGE_KEY = 'google_auth_token';
const TOKEN_EXPIRY_KEY = 'google_auth_expiry';
const DEVICE_ID_KEY = 'google_auth_device_id';
const REFRESH_AVAILABLE_KEY = 'google_auth_has_refresh';

// Proactive refresh: renew 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface StoredToken {
    access_token: string;
    expires_at: number; // unix timestamp ms
}

let gisLoaded = false;
let codeClient: unknown = null;
let resolveCodePromise: ((code: string) => void) | null = null;
let rejectCodePromise: ((err: Error) => void) | null = null;
let refreshTimerId: ReturnType<typeof setTimeout> | null = null;
let isRefreshing = false;

// ── Helpers ──

/**
 * Get or create a stable device ID for this browser
 */
function getDeviceId(): string {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

/**
 * Call a Supabase Edge Function
 */
async function callEdgeFunction<T = unknown>(
    name: string,
    body: Record<string, unknown>
): Promise<T> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase not configured — cannot exchange Google auth code');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || data.message || `Edge function ${name} failed`);
    }

    return response.json() as Promise<T>;
}

/**
 * Store an access token in localStorage and schedule proactive refresh
 */
function storeAccessToken(accessToken: string, expiresIn: number): void {
    const expiresAt = Date.now() + (expiresIn * 1000);
    const stored: StoredToken = { access_token: accessToken, expires_at: expiresAt };
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
    scheduleTokenRefresh(expiresIn * 1000);
}

/**
 * Schedule a proactive token refresh before expiry
 */
function scheduleTokenRefresh(expiresInMs: number): void {
    if (refreshTimerId) {
        clearTimeout(refreshTimerId);
        refreshTimerId = null;
    }

    const refreshInMs = Math.max(expiresInMs - REFRESH_BUFFER_MS, 0);
    console.log(`[GoogleAuth] Scheduling token refresh in ${Math.round(refreshInMs / 1000)}s`);

    refreshTimerId = setTimeout(() => {
        refreshAccessToken().catch((err) => {
            console.error('[GoogleAuth] Proactive refresh failed:', err);
        });
    }, refreshInMs);
}

// ── GIS Script Loading ──

/**
 * Load the Google Identity Services script dynamically
 */
function loadGisScript(): Promise<void> {
    if (gisLoaded) return Promise.resolve();

    return new Promise((resolve, reject) => {
        if (document.getElementById('gis-script')) {
            gisLoaded = true;
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.id = 'gis-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            gisLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
    });
}

/**
 * Initialize the code client (authorization code flow for refresh tokens)
 */
function getCodeClient(): unknown {
    if (codeClient) return codeClient;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Identity Services global
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) return null;

    codeClient = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: SCOPES,
        ux_mode: 'popup',
        callback: (response: Record<string, unknown>) => {
            if (response.error) {
                console.error('[GoogleAuth] Code error:', response.error);
                rejectCodePromise?.(new Error(String(response.error)));
                rejectCodePromise = null;
                resolveCodePromise = null;
                return;
            }

            resolveCodePromise?.(String(response.code));
            resolveCodePromise = null;
            rejectCodePromise = null;
        },
    });

    return codeClient;
}

// ── Public API ──

/**
 * Check if Google auth is available (client ID configured)
 */
export function isGoogleAuthAvailable(): boolean {
    return !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

/**
 * Check if user is currently authenticated.
 * Returns true if access token is valid OR if a refresh token exists server-side.
 */
export function isGoogleConnected(): boolean {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
        try {
            const token: StoredToken = JSON.parse(stored);
            if (token.expires_at > Date.now()) return true;
        } catch {
            // fall through
        }
    }

    // Even if access token is expired, we're "connected" if we have a refresh token
    return localStorage.getItem(REFRESH_AVAILABLE_KEY) === 'true';
}

/**
 * Get the current access token (or null if expired/unavailable).
 * This is synchronous — for async refresh, use googleFetch() or refreshAccessToken().
 */
export function getAccessToken(): string | null {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    try {
        const token: StoredToken = JSON.parse(stored);
        if (token.expires_at > Date.now()) {
            return token.access_token;
        }
        // Token expired — clear it
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        return null;
    } catch {
        return null;
    }
}

/**
 * Refresh the access token using the server-side refresh token.
 * Returns the new access token or null if refresh is unavailable.
 */
export async function refreshAccessToken(): Promise<string | null> {
    if (isRefreshing) {
        // Wait for the in-progress refresh to complete
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (!isRefreshing) {
                    clearInterval(check);
                    resolve(getAccessToken());
                }
            }, 100);
        });
    }

    const hasRefresh = localStorage.getItem(REFRESH_AVAILABLE_KEY);
    if (!hasRefresh) return null;

    isRefreshing = true;
    try {
        const deviceId = getDeviceId();
        const result = await callEdgeFunction<{
            access_token: string;
            expires_in: number;
        }>('google-auth-refresh', { device_id: deviceId });

        storeAccessToken(result.access_token, result.expires_in);
        console.log('[GoogleAuth] Token refreshed successfully');
        return result.access_token;
    } catch (err) {
        console.error('[GoogleAuth] Refresh failed:', err);
        localStorage.removeItem(REFRESH_AVAILABLE_KEY);
        return null;
    } finally {
        isRefreshing = false;
    }
}

/**
 * Initialize auto-refresh on app startup.
 * If a valid token exists, schedules proactive renewal.
 * If the token is expired but a refresh token exists, refreshes immediately.
 */
export function initAutoRefresh(): void {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
        try {
            const token: StoredToken = JSON.parse(stored);
            const remainingMs = token.expires_at - Date.now();

            if (remainingMs > 0) {
                scheduleTokenRefresh(remainingMs);
                return;
            }
        } catch {
            // fall through
        }
    }

    // Token expired or missing — try refresh if available
    if (localStorage.getItem(REFRESH_AVAILABLE_KEY) === 'true') {
        refreshAccessToken().catch(() => {
            console.log('[GoogleAuth] Auto-refresh on startup failed, user must re-auth');
        });
    }
}

/**
 * Request user authentication via Google OAuth2 popup.
 * Uses authorization code flow → exchanges via Edge Function → gets refresh token.
 * Returns the access token on success.
 */
export async function requestGoogleAuth(): Promise<string> {
    if (!isGoogleAuthAvailable()) {
        throw new Error('Google Client ID not configured');
    }

    await loadGisScript();
    const client = getCodeClient();

    if (!client) {
        throw new Error('Failed to initialize Google code client');
    }

    // Step 1: Get authorization code via popup
    const code = await new Promise<string>((resolve, reject) => {
        resolveCodePromise = resolve;
        rejectCodePromise = reject;
        (client as { requestCode: () => void }).requestCode();
    });

    // Step 2: Exchange code for tokens via Edge Function
    const deviceId = getDeviceId();
    const result = await callEdgeFunction<{
        access_token: string;
        expires_in: number;
        has_refresh_token: boolean;
    }>('google-auth-exchange', { code, device_id: deviceId });

    // Step 3: Store access token and schedule refresh
    storeAccessToken(result.access_token, result.expires_in);

    if (result.has_refresh_token) {
        localStorage.setItem(REFRESH_AVAILABLE_KEY, 'true');
    }

    return result.access_token;
}

/**
 * Sign out — revoke token and clear all storage
 */
export async function signOutGoogle(): Promise<void> {
    const token = getAccessToken();
    if (token) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Identity Services global
        const google = (window as any).google;
        if (google?.accounts?.oauth2) {
            google.accounts.oauth2.revoke(token);
        }
    }

    if (refreshTimerId) {
        clearTimeout(refreshTimerId);
        refreshTimerId = null;
    }

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(REFRESH_AVAILABLE_KEY);
    // Keep DEVICE_ID_KEY — it's just an identifier, not sensitive
    codeClient = null;
}

/**
 * Make an authenticated fetch request to a Google API endpoint.
 * Auto-refreshes the token on expiry or 401 — callers never see token expiration.
 */
export async function googleFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    let token = getAccessToken();

    // If token is expired or missing, attempt refresh before failing
    if (!token) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            token = refreshed;
        } else {
            throw new Error('Not authenticated with Google');
        }
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        // Token expired mid-flight — try refresh once
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            const retryHeaders = new Headers(options.headers);
            retryHeaders.set('Authorization', `Bearer ${refreshed}`);
            const retryResponse = await fetch(url, { ...options, headers: retryHeaders });
            if (retryResponse.status === 401) {
                // Refresh token also invalid — clear everything
                localStorage.removeItem(TOKEN_STORAGE_KEY);
                localStorage.removeItem(TOKEN_EXPIRY_KEY);
                localStorage.removeItem(REFRESH_AVAILABLE_KEY);
                throw new Error('Google authentication expired — please sign in again');
            }
            return retryResponse;
        }

        // No refresh available — clear and throw
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        throw new Error('Google authentication expired — please sign in again');
    }

    return response;
}
