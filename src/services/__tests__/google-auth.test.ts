import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock import.meta.env, so we use vi.hoisted + dynamic imports
// to control the environment per test group.

const TOKEN_STORAGE_KEY = 'google_auth_token';
const TOKEN_EXPIRY_KEY = 'google_auth_expiry';

// Mock sessionStorage (OAuth tokens now stored in sessionStorage for security)
const sessionStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        get length() {
            return Object.keys(store).length;
        },
        key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    };
})();

describe('Google Auth Service', () => {
    const originalSessionStorage = globalThis.sessionStorage;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        sessionStorageMock.clear();
        Object.defineProperty(globalThis, 'sessionStorage', {
            value: sessionStorageMock,
            writable: true,
            configurable: true,
        });
        // Reset window.google
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).google = undefined;
    });

    afterEach(() => {
        Object.defineProperty(globalThis, 'sessionStorage', {
            value: originalSessionStorage,
            writable: true,
            configurable: true,
        });
        globalThis.fetch = originalFetch;
    });

    // ========================================================
    // isGoogleConnected
    // ========================================================
    describe('isGoogleConnected', () => {
        it('should return false when no token is stored', async () => {
            const { isGoogleConnected } = await import('../google-auth');
            expect(isGoogleConnected()).toBe(false);
        });

        it('should return true when token is stored and not expired', async () => {
            const token = {
                access_token: 'valid-token',
                expires_at: Date.now() + 3600000, // 1 hour from now
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const { isGoogleConnected } = await import('../google-auth');
            expect(isGoogleConnected()).toBe(true);
        });

        it('should return false when token is expired', async () => {
            const token = {
                access_token: 'expired-token',
                expires_at: Date.now() - 1000, // 1 second ago
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const { isGoogleConnected } = await import('../google-auth');
            expect(isGoogleConnected()).toBe(false);
        });

        it('should return false when stored value is invalid JSON', async () => {
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, 'not-valid-json');

            const { isGoogleConnected } = await import('../google-auth');
            expect(isGoogleConnected()).toBe(false);
        });
    });

    // ========================================================
    // getAccessToken
    // ========================================================
    describe('getAccessToken', () => {
        it('should return null when no token is stored', async () => {
            const { getAccessToken } = await import('../google-auth');
            expect(getAccessToken()).toBeNull();
        });

        it('should return the access token when valid and not expired', async () => {
            const token = {
                access_token: 'my-valid-token',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const { getAccessToken } = await import('../google-auth');
            expect(getAccessToken()).toBe('my-valid-token');
        });

        it('should return null and clear storage when token is expired', async () => {
            const token = {
                access_token: 'expired-token',
                expires_at: Date.now() - 1000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
            sessionStorageMock.setItem(TOKEN_EXPIRY_KEY, String(token.expires_at));

            const { getAccessToken } = await import('../google-auth');
            const result = getAccessToken();

            expect(result).toBeNull();
            expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(TOKEN_STORAGE_KEY);
            expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(TOKEN_EXPIRY_KEY);
        });

        it('should return null when stored value is invalid JSON', async () => {
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, '{bad json}');

            const { getAccessToken } = await import('../google-auth');
            expect(getAccessToken()).toBeNull();
        });
    });

    // ========================================================
    // isGoogleAuthAvailable
    // ========================================================
    describe('isGoogleAuthAvailable', () => {
        it('should return false when VITE_GOOGLE_CLIENT_ID is not set', async () => {
            // Mock import.meta.env to have no VITE_GOOGLE_CLIENT_ID
            vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');

            // Force module reload with new env
            vi.resetModules();
            const { isGoogleAuthAvailable } = await import('../google-auth');

            expect(isGoogleAuthAvailable()).toBe(false);

            vi.unstubAllEnvs();
        });
    });

    // ========================================================
    // googleFetch
    // ========================================================
    describe('googleFetch', () => {
        it('should throw when no valid token is available', async () => {
            const { googleFetch } = await import('../google-auth');

            await expect(
                googleFetch('https://www.googleapis.com/test')
            ).rejects.toThrow('Not authenticated with Google');
        });

        it('should attach Bearer authorization header', async () => {
            const token = {
                access_token: 'test-access-token',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({}),
            });
            globalThis.fetch = mockFetch;

            const { googleFetch } = await import('../google-auth');
            await googleFetch('https://www.googleapis.com/test');

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockFetch.mock.calls[0];
            expect(url).toBe('https://www.googleapis.com/test');
            const headers = options.headers;
            expect(headers.get('Authorization')).toBe('Bearer test-access-token');
        });

        it('should merge custom headers with authorization', async () => {
            const token = {
                access_token: 'test-access-token',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({}),
            });
            globalThis.fetch = mockFetch;

            const { googleFetch } = await import('../google-auth');
            await googleFetch('https://www.googleapis.com/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const [, options] = mockFetch.mock.calls[0];
            const headers = options.headers;
            expect(headers.get('Authorization')).toBe('Bearer test-access-token');
            expect(headers.get('Content-Type')).toBe('application/json');
            expect(options.method).toBe('POST');
        });

        it('should clear token and throw on 401 response', async () => {
            const token = {
                access_token: 'revoked-token',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
            sessionStorageMock.setItem(TOKEN_EXPIRY_KEY, String(token.expires_at));

            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: vi.fn().mockResolvedValue({}),
            });
            globalThis.fetch = mockFetch;

            const { googleFetch } = await import('../google-auth');

            await expect(
                googleFetch('https://www.googleapis.com/test')
            ).rejects.toThrow('Google authentication expired');

            expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(TOKEN_STORAGE_KEY);
            expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(TOKEN_EXPIRY_KEY);
        });

        it('should return the response for non-401 errors', async () => {
            const token = {
                access_token: 'test-token',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: vi.fn().mockResolvedValue({ error: 'forbidden' }),
            });
            globalThis.fetch = mockFetch;

            const { googleFetch } = await import('../google-auth');
            const response = await googleFetch('https://www.googleapis.com/test');

            expect(response.status).toBe(403);
            expect(response.ok).toBe(false);
        });

        it('should pass through the response on success', async () => {
            const token = {
                access_token: 'test-token',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const expectedData = { items: [{ id: '1' }] };
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(expectedData),
            });
            globalThis.fetch = mockFetch;

            const { googleFetch } = await import('../google-auth');
            const response = await googleFetch('https://www.googleapis.com/test');

            expect(response.ok).toBe(true);
            const data = await response.json();
            expect(data).toEqual(expectedData);
        });
    });

    // ========================================================
    // signOutGoogle
    // ========================================================
    describe('signOutGoogle', () => {
        it('should clear sessionStorage token entries', async () => {
            const token = {
                access_token: 'test-token',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
            sessionStorageMock.setItem(TOKEN_EXPIRY_KEY, String(token.expires_at));

            const { signOutGoogle } = await import('../google-auth');
            await signOutGoogle();

            expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(TOKEN_STORAGE_KEY);
            expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(TOKEN_EXPIRY_KEY);
        });

        it('should call google.accounts.oauth2.revoke if google is available', async () => {
            const token = {
                access_token: 'token-to-revoke',
                expires_at: Date.now() + 3600000,
            };
            sessionStorageMock.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));

            const mockRevoke = vi.fn();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).google = {
                accounts: {
                    oauth2: {
                        revoke: mockRevoke,
                    },
                },
            };

            const { signOutGoogle } = await import('../google-auth');
            await signOutGoogle();

            expect(mockRevoke).toHaveBeenCalledWith('token-to-revoke');
        });

        it('should not throw when google global is not available', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).google = undefined;

            const { signOutGoogle } = await import('../google-auth');
            await expect(signOutGoogle()).resolves.toBeUndefined();
        });

        it('should not call revoke when no token exists', async () => {
            const mockRevoke = vi.fn();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).google = {
                accounts: {
                    oauth2: {
                        revoke: mockRevoke,
                    },
                },
            };

            const { signOutGoogle } = await import('../google-auth');
            await signOutGoogle();

            expect(mockRevoke).not.toHaveBeenCalled();
        });
    });

    // ========================================================
    // requestGoogleAuth
    // ========================================================
    describe('requestGoogleAuth', () => {
        it('should throw when Google Client ID is not configured', async () => {
            // Mock import.meta.env to have no VITE_GOOGLE_CLIENT_ID
            vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');

            // Force module reload with new env
            vi.resetModules();
            const { requestGoogleAuth } = await import('../google-auth');

            await expect(requestGoogleAuth()).rejects.toThrow(
                'Google Client ID not configured'
            );

            vi.unstubAllEnvs();
        });
    });
});
