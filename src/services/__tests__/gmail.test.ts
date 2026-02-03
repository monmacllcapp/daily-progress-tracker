import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the google-auth module before importing gmail
vi.mock('../google-auth', () => ({
    googleFetch: vi.fn(),
    isGoogleConnected: vi.fn(),
}));

import {
    listMessages,
    getMessage,
    archiveMessage,
    sendReply,
    extractUnsubscribeLink,
    syncGmailInbox,
} from '../gmail';
import { googleFetch, isGoogleConnected } from '../google-auth';

const mockGoogleFetch = googleFetch as ReturnType<typeof vi.fn>;
const mockIsGoogleConnected = isGoogleConnected as ReturnType<typeof vi.fn>;

// Helper to create a mock Response
function mockResponse(body: unknown, status = 200, ok = true): Response {
    return {
        ok,
        status,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
        headers: new Headers(),
        redirected: false,
        statusText: ok ? 'OK' : 'Error',
        type: 'basic' as ResponseType,
        url: '',
        clone: vi.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
        bytes: vi.fn(),
    } as unknown as Response;
}

// Helper to build a minimal GmailMessage
function makeGmailMessage(overrides: Record<string, unknown> = {}) {
    return {
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'Hello world',
        payload: {
            headers: [
                { name: 'From', value: 'alice@example.com' },
                { name: 'Subject', value: 'Test Subject' },
                { name: 'Message-ID', value: '<abc123@mail.example.com>' },
            ],
            mimeType: 'text/plain',
            body: { data: 'SGVsbG8gd29ybGQ=', size: 11 },
        },
        internalDate: '1706745600000', // 2024-02-01T00:00:00Z
        ...overrides,
    };
}

describe('Gmail Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsGoogleConnected.mockReturnValue(true);
    });

    // ========================================================
    // listMessages
    // ========================================================
    describe('listMessages', () => {
        it('should return empty messages when not connected', async () => {
            mockIsGoogleConnected.mockReturnValue(false);
            const result = await listMessages();
            expect(result).toEqual({ messages: [] });
            expect(mockGoogleFetch).not.toHaveBeenCalled();
        });

        it('should fetch messages with default params', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse({
                    messages: [
                        { id: 'msg-1', threadId: 'thread-1' },
                        { id: 'msg-2', threadId: 'thread-2' },
                    ],
                    resultSizeEstimate: 2,
                })
            );

            const result = await listMessages();

            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);
            const calledUrl = mockGoogleFetch.mock.calls[0][0] as string;
            expect(calledUrl).toContain('/messages?');
            expect(calledUrl).toContain('maxResults=100');
            expect(calledUrl).toContain('q=in%3Ainbox');
            expect(result.messages).toHaveLength(2);
            expect(result.messages[0].id).toBe('msg-1');
        });

        it('should pass custom maxResults and query', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse({ messages: [], resultSizeEstimate: 0 })
            );

            await listMessages(5, 'is:starred');

            const calledUrl = mockGoogleFetch.mock.calls[0][0] as string;
            expect(calledUrl).toContain('maxResults=5');
            expect(calledUrl).toContain('q=is%3Astarred');
        });

        it('should return empty messages when API returns no messages', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse({ resultSizeEstimate: 0 })
            );

            const result = await listMessages();
            expect(result).toEqual({ messages: [], nextPageToken: undefined });
        });

        it('should throw on non-ok response', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}, 403, false));

            await expect(listMessages()).rejects.toThrow('Gmail list failed: 403');
        });
    });

    // ========================================================
    // getMessage
    // ========================================================
    describe('getMessage', () => {
        it('should fetch a full message by ID', async () => {
            const msg = makeGmailMessage();
            mockGoogleFetch.mockResolvedValue(mockResponse(msg));

            const result = await getMessage('msg-1');

            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);
            const calledUrl = mockGoogleFetch.mock.calls[0][0] as string;
            expect(calledUrl).toContain('/messages/msg-1?format=full');
            expect(result.id).toBe('msg-1');
            expect(result.snippet).toBe('Hello world');
        });

        it('should throw on non-ok response', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}, 404, false));

            await expect(getMessage('bad-id')).rejects.toThrow(
                'Gmail get message failed: 404'
            );
        });
    });

    // ========================================================
    // archiveMessage
    // ========================================================
    describe('archiveMessage', () => {
        it('should POST a modify request to remove INBOX label', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}));

            await archiveMessage('msg-1');

            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockGoogleFetch.mock.calls[0];
            expect(url).toContain('/messages/msg-1/modify');
            expect(options.method).toBe('POST');
            expect(JSON.parse(options.body)).toEqual({
                removeLabelIds: ['INBOX'],
            });
        });

        it('should throw on non-ok response', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}, 500, false));

            await expect(archiveMessage('msg-1')).rejects.toThrow(
                'Gmail archive failed: 500'
            );
        });
    });

    // ========================================================
    // sendReply
    // ========================================================
    describe('sendReply', () => {
        it('should encode and send an email reply', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse({ id: 'sent-msg-1' })
            );

            const result = await sendReply(
                'thread-1',
                'bob@example.com',
                'Re: Hello',
                'Thanks for your message!'
            );

            expect(result).toBe('sent-msg-1');
            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);

            const [url, options] = mockGoogleFetch.mock.calls[0];
            expect(url).toContain('/messages/send');
            expect(options.method).toBe('POST');

            const body = JSON.parse(options.body);
            expect(body.threadId).toBe('thread-1');
            expect(body.raw).toBeDefined();
            // raw should be base64url encoded
            expect(body.raw).not.toContain('+');
            expect(body.raw).not.toContain('/');
            expect(body.raw).not.toContain('=');
        });

        it('should include In-Reply-To header when provided', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse({ id: 'sent-msg-2' })
            );

            await sendReply(
                'thread-1',
                'bob@example.com',
                'Re: Hello',
                'Reply body',
                '<original-msg-id@example.com>'
            );

            const body = JSON.parse(mockGoogleFetch.mock.calls[0][1].body);
            // Decode the raw to verify the In-Reply-To header was included
            const decoded = decodeURIComponent(
                escape(atob(body.raw.replace(/-/g, '+').replace(/_/g, '/')))
            );
            expect(decoded).toContain('In-Reply-To: <original-msg-id@example.com>');
        });

        it('should throw on non-ok response', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}, 400, false));

            await expect(
                sendReply('thread-1', 'bob@example.com', 'Re: Hi', 'Body')
            ).rejects.toThrow('Gmail send failed: 400');
        });
    });

    // ========================================================
    // extractUnsubscribeLink
    // ========================================================
    describe('extractUnsubscribeLink', () => {
        it('should extract an HTTPS unsubscribe URL', () => {
            const msg = makeGmailMessage({
                payload: {
                    headers: [
                        { name: 'From', value: 'news@example.com' },
                        { name: 'Subject', value: 'Newsletter' },
                        {
                            name: 'List-Unsubscribe',
                            value: '<https://example.com/unsub?id=123>',
                        },
                    ],
                    mimeType: 'text/plain',
                    body: { data: '', size: 0 },
                },
            });

            const link = extractUnsubscribeLink(msg as never);
            expect(link).toBe('https://example.com/unsub?id=123');
        });

        it('should extract HTTP unsubscribe URL', () => {
            const msg = makeGmailMessage({
                payload: {
                    headers: [
                        { name: 'From', value: 'news@example.com' },
                        { name: 'Subject', value: 'Newsletter' },
                        {
                            name: 'List-Unsubscribe',
                            value: '<http://example.com/unsub>',
                        },
                    ],
                    mimeType: 'text/plain',
                    body: { data: '', size: 0 },
                },
            });

            const link = extractUnsubscribeLink(msg as never);
            expect(link).toBe('http://example.com/unsub');
        });

        it('should return null when no List-Unsubscribe header exists', () => {
            const msg = makeGmailMessage();
            const link = extractUnsubscribeLink(msg as never);
            expect(link).toBeNull();
        });

        it('should return null for mailto-only unsubscribe headers', () => {
            const msg = makeGmailMessage({
                payload: {
                    headers: [
                        { name: 'From', value: 'news@example.com' },
                        { name: 'Subject', value: 'Newsletter' },
                        {
                            name: 'List-Unsubscribe',
                            value: '<mailto:unsub@example.com>',
                        },
                    ],
                    mimeType: 'text/plain',
                    body: { data: '', size: 0 },
                },
            });

            const link = extractUnsubscribeLink(msg as never);
            expect(link).toBeNull();
        });

        it('should prefer HTTPS URL even when mailto is present', () => {
            const msg = makeGmailMessage({
                payload: {
                    headers: [
                        { name: 'From', value: 'news@example.com' },
                        { name: 'Subject', value: 'Newsletter' },
                        {
                            name: 'List-Unsubscribe',
                            value: '<mailto:unsub@example.com>, <https://example.com/unsub>',
                        },
                    ],
                    mimeType: 'text/plain',
                    body: { data: '', size: 0 },
                },
            });

            const link = extractUnsubscribeLink(msg as never);
            expect(link).toBe('https://example.com/unsub');
        });
    });

    // ========================================================
    // syncGmailInbox
    // ========================================================
    describe('syncGmailInbox', () => {
        function makeMockDb() {
            return {
                emails: {
                    findOne: vi.fn().mockReturnValue({
                        exec: vi.fn().mockResolvedValue(null),
                    }),
                    insert: vi.fn().mockResolvedValue({}),
                },
            };
        }

        it('should sync new emails and return count', async () => {
            const db = makeMockDb();

            // listMessages call
            mockGoogleFetch
                .mockResolvedValueOnce(
                    mockResponse({
                        messages: [
                            { id: 'msg-1', threadId: 'thread-1' },
                            { id: 'msg-2', threadId: 'thread-2' },
                        ],
                        resultSizeEstimate: 2,
                    })
                )
                // getMessage for msg-1
                .mockResolvedValueOnce(
                    mockResponse(
                        makeGmailMessage({
                            id: 'msg-1',
                            threadId: 'thread-1',
                            labelIds: ['INBOX', 'UNREAD'],
                        })
                    )
                )
                // getMessage for msg-2
                .mockResolvedValueOnce(
                    mockResponse(
                        makeGmailMessage({
                            id: 'msg-2',
                            threadId: 'thread-2',
                            labelIds: ['INBOX'],
                            snippet: 'Second email',
                            payload: {
                                headers: [
                                    { name: 'From', value: 'bob@example.com' },
                                    { name: 'Subject', value: 'Another Subject' },
                                ],
                                mimeType: 'text/plain',
                                body: { data: '', size: 0 },
                            },
                        })
                    )
                );

            const classifyFn = vi.fn().mockResolvedValue('important');

            // Mock crypto.randomUUID
            const originalRandomUUID = crypto.randomUUID;
            let uuidCounter = 0;
            crypto.randomUUID = vi.fn(() => `uuid-${++uuidCounter}`) as typeof crypto.randomUUID;

            const result = await syncGmailInbox(db as never, classifyFn, 10);

            expect(result.newCount).toBe(2);
            expect(db.emails.insert).toHaveBeenCalledTimes(2);
            expect(classifyFn).toHaveBeenCalledTimes(2);

            // Verify first insert
            const firstInsert = db.emails.insert.mock.calls[0][0];
            expect(firstInsert.gmail_id).toBe('msg-1');
            expect(firstInsert.from).toBe('alice@example.com');
            expect(firstInsert.subject).toBe('Test Subject');
            expect(firstInsert.tier).toBe('important');
            expect(firstInsert.status).toBe('unread');

            // Second insert should have status 'read' (no UNREAD label)
            const secondInsert = db.emails.insert.mock.calls[1][0];
            expect(secondInsert.gmail_id).toBe('msg-2');
            expect(secondInsert.status).toBe('read');

            crypto.randomUUID = originalRandomUUID;
        });

        it('should skip already-stored emails', async () => {
            const db = makeMockDb();
            // Simulate existing email in DB
            db.emails.findOne.mockReturnValue({
                exec: vi.fn().mockResolvedValue({ id: 'existing' }),
            });

            mockGoogleFetch.mockResolvedValueOnce(
                mockResponse({
                    messages: [{ id: 'msg-1', threadId: 'thread-1' }],
                    resultSizeEstimate: 1,
                })
            );

            const classifyFn = vi.fn();
            const result = await syncGmailInbox(db as never, classifyFn, 10);

            expect(result.newCount).toBe(0);
            expect(db.emails.insert).not.toHaveBeenCalled();
            expect(classifyFn).not.toHaveBeenCalled();
        });

        it('should return 0 when no messages are returned', async () => {
            const db = makeMockDb();

            mockGoogleFetch.mockResolvedValueOnce(
                mockResponse({ resultSizeEstimate: 0 })
            );

            const classifyFn = vi.fn();
            const result = await syncGmailInbox(db as never, classifyFn);

            expect(result.newCount).toBe(0);
            expect(db.emails.insert).not.toHaveBeenCalled();
        });

        it('should propagate errors from listMessages', async () => {
            const db = makeMockDb();
            mockGoogleFetch.mockResolvedValueOnce(mockResponse({}, 500, false));

            const classifyFn = vi.fn();
            await expect(
                syncGmailInbox(db as never, classifyFn)
            ).rejects.toThrow('Gmail list failed: 500');
        });

        it('should propagate errors from getMessage', async () => {
            const db = makeMockDb();

            mockGoogleFetch
                .mockResolvedValueOnce(
                    mockResponse({
                        messages: [{ id: 'msg-1', threadId: 'thread-1' }],
                        resultSizeEstimate: 1,
                    })
                )
                .mockResolvedValueOnce(mockResponse({}, 404, false));

            const classifyFn = vi.fn();
            await expect(
                syncGmailInbox(db as never, classifyFn)
            ).rejects.toThrow('Gmail get message failed: 404');
        });
    });
});
