/**
 * Google Authentication Service
 *
 * Uses Google Identity Services (GIS) for browser-based OAuth2.
 * Shared auth for Calendar + Gmail scopes.
 * Gracefully degrades when VITE_GOOGLE_CLIENT_ID is not set.
 */

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

const TOKEN_STORAGE_KEY = 'google_auth_token';
const TOKEN_EXPIRY_KEY = 'google_auth_expiry';

interface StoredToken {
    access_token: string;
    expires_at: number; // unix timestamp ms
}

let gisLoaded = false;
let tokenClient: unknown = null;
let resolveTokenPromise: ((token: string) => void) | null = null;
let rejectTokenPromise: ((err: Error) => void) | null = null;

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
 * Initialize the token client (must be called after GIS script loads)
 */
function getTokenClient(): unknown {
    if (tokenClient) return tokenClient;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Identity Services global
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) return null;

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: Record<string, unknown>) => {
            if (response.error) {
                console.error('[GoogleAuth] Token error:', response.error);
                rejectTokenPromise?.(new Error(String(response.error)));
                rejectTokenPromise = null;
                resolveTokenPromise = null;
                return;
            }

            const expiresAt = Date.now() + (Number(response.expires_in) * 1000);
            const stored: StoredToken = {
                access_token: String(response.access_token),
                expires_at: expiresAt,
            };

            sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
            sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));

            resolveTokenPromise?.(String(response.access_token));
            resolveTokenPromise = null;
            rejectTokenPromise = null;
        },
    });

    return tokenClient;
}

/**
 * Check if Google auth is available (client ID configured)
 */
export function isGoogleAuthAvailable(): boolean {
    return !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

/**
 * Check if user is currently authenticated with a valid token
 */
export function isGoogleConnected(): boolean {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return false;

    try {
        const token: StoredToken = JSON.parse(stored);
        return token.expires_at > Date.now();
    } catch {
        return false;
    }
}

/**
 * Get the current access token (or null if expired/unavailable)
 */
export function getAccessToken(): string | null {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    try {
        const token: StoredToken = JSON.parse(stored);
        if (token.expires_at > Date.now()) {
            return token.access_token;
        }
        // Token expired — clear it
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
        return null;
    } catch {
        return null;
    }
}

/**
 * Request user authentication via Google OAuth2 popup.
 * Returns the access token on success.
 */
export async function requestGoogleAuth(): Promise<string> {
    if (!isGoogleAuthAvailable()) {
        throw new Error('Google Client ID not configured');
    }

    await loadGisScript();
    const client = getTokenClient();

    if (!client) {
        throw new Error('Failed to initialize Google token client');
    }

    return new Promise<string>((resolve, reject) => {
        resolveTokenPromise = resolve;
        rejectTokenPromise = reject;
        (client as { requestAccessToken: (opts: { prompt: string }) => void }).requestAccessToken({ prompt: 'consent' });
    });
}

/**
 * Sign out — revoke token and clear storage
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

    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    tokenClient = null;
}

/**
 * Make an authenticated fetch request to a Google API endpoint.
 * Throws if no valid token is available.
 */
export async function googleFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const token = getAccessToken();
    if (!token) {
        throw new Error('Not authenticated with Google');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        // Token expired or revoked — clear and throw
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
        throw new Error('Google authentication expired — please sign in again');
    }

    return response;
}
