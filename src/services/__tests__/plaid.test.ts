import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('plaid service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isPlaidConfigured', () => {
    it('should return false when no env vars set', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

      const { isPlaidConfigured } = await import('../plaid');

      expect(isPlaidConfigured()).toBe(false);
    });

    it('should return true when both env vars are set', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const { isPlaidConfigured } = await import('../plaid');

      expect(isPlaidConfigured()).toBe(true);
    });

    it('should return false when only VITE_SUPABASE_URL is set', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

      const { isPlaidConfigured } = await import('../plaid');

      expect(isPlaidConfigured()).toBe(false);
    });

    it('should return false when only VITE_SUPABASE_ANON_KEY is set', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const { isPlaidConfigured } = await import('../plaid');

      expect(isPlaidConfigured()).toBe(false);
    });
  });

  describe('getLinkedAccounts', () => {
    it('should return mapped accounts from database', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const mockAccounts = [
        {
          toJSON: () => ({
            id: 'acc1',
            item_id: 'item1',
            account_id: 'plaid_acc1',
            name: 'Checking',
            official_name: 'Main Checking Account',
            type: 'depository',
            subtype: 'checking',
            mask: '1234',
            current_balance: 1000.0,
            available_balance: 950.0,
            institution_name: 'Chase',
            scope: 'personal',
            is_active: true,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          }),
        },
        {
          toJSON: () => ({
            id: 'acc2',
            item_id: 'item1',
            account_id: 'plaid_acc2',
            name: 'Credit Card',
            official_name: 'Sapphire Reserve',
            type: 'credit',
            subtype: 'credit_card',
            mask: '5678',
            current_balance: -500.0,
            available_balance: 9500.0,
            institution_name: 'Chase',
            scope: 'business',
            is_active: true,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          }),
        },
      ];

      const execMock = vi.fn().mockResolvedValue(mockAccounts);
      const findMock = vi.fn().mockReturnValue({ exec: execMock });

      const mockDb = {
        financial_accounts: {
          find: findMock,
        },
      } as any;

      const { getLinkedAccounts } = await import('../plaid');
      const result = await getLinkedAccounts(mockDb);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'acc1',
        item_id: 'item1',
        account_id: 'plaid_acc1',
        name: 'Checking',
        official_name: 'Main Checking Account',
        type: 'depository',
        subtype: 'checking',
        mask: '1234',
        current_balance: 1000.0,
        available_balance: 950.0,
        institution_name: 'Chase',
        scope: 'personal',
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      });
    });
  });

  describe('saveAccountsToDb', () => {
    it('should upsert each account to database', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const upsertMock = vi.fn();
      const mockDb = {
        financial_accounts: {
          upsert: upsertMock,
        },
      } as any;

      const accounts = [
        {
          plaid_account_id: 'plaid_acc1',
          plaid_item_id: 'item1',
          institution_name: 'Chase',
          account_name: 'Checking',
          account_type: 'checking',
          mask: '1234',
          current_balance: 1000.0,
          available_balance: 950.0,
          currency: 'USD',
        },
        {
          plaid_account_id: 'plaid_acc2',
          plaid_item_id: 'item1',
          institution_name: 'Chase',
          account_name: 'Savings',
          account_type: 'savings',
          mask: '5678',
          current_balance: 5000.0,
          available_balance: 5000.0,
          currency: 'USD',
        },
      ];

      const { saveAccountsToDb } = await import('../plaid');
      await saveAccountsToDb(mockDb, accounts, 'personal');

      expect(upsertMock).toHaveBeenCalledTimes(2);
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'plaid_acc1',
          plaid_account_id: 'plaid_acc1',
          plaid_item_id: 'item1',
          institution_name: 'Chase',
          account_name: 'Checking',
          account_type: 'checking',
          account_scope: 'personal',
          mask: '1234',
          current_balance: 1000.0,
          available_balance: 950.0,
          currency: 'USD',
          is_active: true,
        })
      );
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'plaid_acc2',
          plaid_account_id: 'plaid_acc2',
          plaid_item_id: 'item1',
          institution_name: 'Chase',
          account_name: 'Savings',
          account_type: 'savings',
          account_scope: 'personal',
          mask: '5678',
          current_balance: 5000.0,
          available_balance: 5000.0,
          currency: 'USD',
          is_active: true,
        })
      );
    });
  });

  describe('createLinkToken', () => {
    it('should call Supabase edge function and return link_token', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const mockInvoke = vi.fn().mockResolvedValue({
        data: { link_token: 'link-sandbox-test-token' },
        error: null,
      });

      const mockSupabase = {
        functions: {
          invoke: mockInvoke,
        },
      };

      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue(mockSupabase),
      }));

      const { createLinkToken } = await import('../plaid');
      const result = await createLinkToken();

      expect(mockInvoke).toHaveBeenCalledWith('create-link-token', {
        body: {},
      });
      expect(result).toBe('link-sandbox-test-token');
    });

    it('should throw error when Supabase not configured', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

      const { createLinkToken } = await import('../plaid');

      await expect(createLinkToken()).rejects.toThrow('Supabase not configured');
    });

    it('should throw error when edge function returns error', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const mockInvoke = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Failed to create link token' },
      });

      const mockSupabase = {
        functions: {
          invoke: mockInvoke,
        },
      };

      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue(mockSupabase),
      }));

      const { createLinkToken } = await import('../plaid');

      await expect(createLinkToken()).rejects.toThrow('Failed to create link token');
    });
  });

  describe('exchangePublicToken', () => {
    it('should call edge function with correct body', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          item_id: 'item-sandbox-test-id',
          accounts: [],
        },
        error: null,
      });

      const mockSupabase = {
        functions: {
          invoke: mockInvoke,
        },
      };

      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue(mockSupabase),
      }));

      const { exchangePublicToken } = await import('../plaid');
      const result = await exchangePublicToken('public-sandbox-test-token');

      expect(mockInvoke).toHaveBeenCalledWith('exchange-token', {
        body: { public_token: 'public-sandbox-test-token' },
      });
      expect(result).toEqual({
        item_id: 'item-sandbox-test-id',
        accounts: [],
      });
    });

    it('should throw error when Supabase not configured', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

      const { exchangePublicToken } = await import('../plaid');

      await expect(exchangePublicToken('public-token')).rejects.toThrow(
        'Supabase not configured'
      );
    });

    it('should throw error when edge function returns error', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const mockInvoke = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Invalid public token' },
      });

      const mockSupabase = {
        functions: {
          invoke: mockInvoke,
        },
      };

      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue(mockSupabase),
      }));

      const { exchangePublicToken } = await import('../plaid');

      await expect(exchangePublicToken('invalid-token')).rejects.toThrow(
        'Invalid public token'
      );
    });
  });

  describe('syncTransactions', () => {
    it('should call edge function with correct body', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          added: [],
          modified: [],
          removed: [],
          next_cursor: 'cursor-123',
        },
        error: null,
      });

      const mockSupabase = {
        functions: {
          invoke: mockInvoke,
        },
      };

      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue(mockSupabase),
      }));

      const { syncTransactions } = await import('../plaid');
      const result = await syncTransactions('item-sandbox-test-id');

      expect(mockInvoke).toHaveBeenCalledWith('sync-transactions', {
        body: { item_id: 'item-sandbox-test-id' },
      });
      expect(result).toEqual({
        added: [],
        modified: [],
        removed: [],
        next_cursor: 'cursor-123',
      });
    });

    it('should throw error when Supabase not configured', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

      const { syncTransactions } = await import('../plaid');

      await expect(syncTransactions('item-id')).rejects.toThrow(
        'Supabase not configured'
      );
    });

    it('should throw error when edge function returns error', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      const mockInvoke = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Item not found' },
      });

      const mockSupabase = {
        functions: {
          invoke: mockInvoke,
        },
      };

      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue(mockSupabase),
      }));

      const { syncTransactions } = await import('../plaid');

      await expect(syncTransactions('invalid-item-id')).rejects.toThrow(
        'Item not found'
      );
    });
  });
});
