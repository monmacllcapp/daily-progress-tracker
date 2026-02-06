import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FinancialTransaction, FinancialSubscription } from '../../types/schema';

describe('financial-analysis service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('categorizeTransaction', () => {
    it('should categorize Netflix as subscription/personal', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Netflix',
        amount: 15.99,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'subscription', scope: 'personal' });
    });

    it('should categorize GitHub as software/business', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'GitHub',
        amount: 20.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'software', scope: 'business' });
    });

    it('should categorize Google Ads as marketing/business', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Google Ads',
        amount: 500.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'marketing', scope: 'business' });
    });

    it('should categorize Uber Eats as food/personal', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Uber Eats',
        amount: 25.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'food', scope: 'personal' });
    });

    it('should categorize Uber as travel/personal', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Uber',
        amount: 15.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'travel', scope: 'personal' });
    });

    it('should categorize Comcast as utilities/personal', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Comcast',
        amount: 80.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'utilities', scope: 'personal' });
    });

    it('should categorize Rent Payment as rent_mortgage/personal', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Rent Payment',
        amount: 2000.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'rent_mortgage', scope: 'personal' });
    });

    it('should categorize ADP Payroll as payroll/business', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'ADP Payroll',
        amount: 5000.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'payroll', scope: 'business' });
    });

    it('should categorize unknown merchant as other/personal', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Unknown Store',
        amount: 50.0,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'other', scope: 'personal' });
    });

    it('should prioritize merchant_name over name', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'Unknown Store',
        merchant_name: 'Netflix',
        amount: 15.99,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'subscription', scope: 'personal' });
    });

    it('should be case insensitive', async () => {
      const { categorizeTransaction } = await import('../financial-analysis');
      const result = categorizeTransaction({
        id: '1',
        name: 'NETFLIX',
        amount: 15.99,
      } as FinancialTransaction);
      expect(result).toEqual({ category: 'subscription', scope: 'personal' });
    });
  });

  describe('detectSubscriptions', () => {
    it('should detect monthly subscription from 3 similar transactions 30 days apart', async () => {
      const { detectSubscriptions } = await import('../financial-analysis');

      const upsertMock = vi.fn();
      const mockDb = {
        financial_subscriptions: {
          upsert: upsertMock,
        },
      } as any;

      const transactions: FinancialTransaction[] = [
        {
          id: '1',
          account_id: 'acc1',
          date: '2025-01-01',
          amount: 15.99,
          name: 'Netflix',
          merchant_name: 'Netflix',
          category: 'subscription',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          account_id: 'acc1',
          date: '2025-02-01',
          amount: 15.99,
          name: 'Netflix',
          merchant_name: 'Netflix',
          category: 'subscription',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-02',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
        {
          id: '3',
          account_id: 'acc1',
          date: '2025-03-01',
          amount: 15.99,
          name: 'Netflix',
          merchant_name: 'Netflix',
          category: 'subscription',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-03',
          created_at: '2025-03-01T00:00:00Z',
          updated_at: '2025-03-01T00:00:00Z',
        },
      ];

      await detectSubscriptions(mockDb, transactions);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant_name: 'Netflix',
          frequency: 'monthly',
          amount: 15.99,
          is_active: true,
        })
      );
    });

    it('should detect weekly subscription from 3 transactions 7 days apart', async () => {
      const { detectSubscriptions } = await import('../financial-analysis');

      const upsertMock = vi.fn();
      const mockDb = {
        financial_subscriptions: {
          upsert: upsertMock,
        },
      } as any;

      const transactions: FinancialTransaction[] = [
        {
          id: '1',
          account_id: 'acc1',
          date: '2025-01-01',
          amount: 10.0,
          name: 'Weekly Service',
          category: 'subscription',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          account_id: 'acc1',
          date: '2025-01-08',
          amount: 10.0,
          name: 'Weekly Service',
          category: 'subscription',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-08T00:00:00Z',
          updated_at: '2025-01-08T00:00:00Z',
        },
        {
          id: '3',
          account_id: 'acc1',
          date: '2025-01-15',
          amount: 10.0,
          name: 'Weekly Service',
          category: 'subscription',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-15T00:00:00Z',
          updated_at: '2025-01-15T00:00:00Z',
        },
      ];

      await detectSubscriptions(mockDb, transactions);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant_name: 'Weekly Service',
          frequency: 'weekly',
          amount: 10.0,
        })
      );
    });

    it('should not detect subscription with varying amounts (>20% difference)', async () => {
      const { detectSubscriptions } = await import('../financial-analysis');

      const upsertMock = vi.fn();
      const mockDb = {
        financial_subscriptions: {
          upsert: upsertMock,
        },
      } as any;

      const transactions: FinancialTransaction[] = [
        {
          id: '1',
          account_id: 'acc1',
          date: '2025-01-01',
          amount: 10.0,
          name: 'Variable Store',
          category: 'other',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          account_id: 'acc1',
          date: '2025-02-01',
          amount: 50.0,
          name: 'Variable Store',
          category: 'other',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-02',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
        {
          id: '3',
          account_id: 'acc1',
          date: '2025-03-01',
          amount: 15.0,
          name: 'Variable Store',
          category: 'other',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-03',
          created_at: '2025-03-01T00:00:00Z',
          updated_at: '2025-03-01T00:00:00Z',
        },
      ];

      await detectSubscriptions(mockDb, transactions);

      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('should not detect subscription from single transaction', async () => {
      const { detectSubscriptions } = await import('../financial-analysis');

      const upsertMock = vi.fn();
      const mockDb = {
        financial_subscriptions: {
          upsert: upsertMock,
        },
      } as any;

      const transactions: FinancialTransaction[] = [
        {
          id: '1',
          account_id: 'acc1',
          date: '2025-01-01',
          amount: 100.0,
          name: 'One Time Purchase',
          category: 'other',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      await detectSubscriptions(mockDb, transactions);

      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('should skip negative amounts (income/credits)', async () => {
      const { detectSubscriptions } = await import('../financial-analysis');

      const upsertMock = vi.fn();
      const mockDb = {
        financial_subscriptions: {
          upsert: upsertMock,
        },
      } as any;

      const transactions: FinancialTransaction[] = [
        {
          id: '1',
          account_id: 'acc1',
          date: '2025-01-01',
          amount: -100.0,
          name: 'Income',
          category: 'income',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          account_id: 'acc1',
          date: '2025-02-01',
          amount: -100.0,
          name: 'Income',
          category: 'income',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-02',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
        {
          id: '3',
          account_id: 'acc1',
          date: '2025-03-01',
          amount: -100.0,
          name: 'Income',
          category: 'income',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-03',
          created_at: '2025-03-01T00:00:00Z',
          updated_at: '2025-03-01T00:00:00Z',
        },
      ];

      await detectSubscriptions(mockDb, transactions);

      expect(upsertMock).not.toHaveBeenCalled();
    });
  });

  describe('flagUnusedSubscriptions', () => {
    it('should flag subscription with no last_used_date', async () => {
      const { flagUnusedSubscriptions } = await import('../financial-analysis');

      const patchMock = vi.fn();
      const execMock = vi.fn().mockResolvedValue({
        patch: patchMock,
      });
      const findOneMock = vi.fn().mockReturnValue({ exec: execMock });

      const mockDb = {
        financial_subscriptions: {
          findOne: findOneMock,
        },
      } as any;

      const subscriptions: FinancialSubscription[] = [
        {
          id: 'sub1',
          merchant_name: 'Netflix',
          amount: 15.99,
          frequency: 'monthly',
          is_active: true,
          flagged_unused: false,
          account_id: 'acc1',
          category: 'subscription',
          scope: 'personal',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = await flagUnusedSubscriptions(mockDb, subscriptions);

      expect(findOneMock).toHaveBeenCalledWith('sub1');
      expect(patchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          flagged_unused: true,
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].flagged_unused).toBe(true);
    });

    it('should flag subscription with last_used_date > 30 days ago', async () => {
      const { flagUnusedSubscriptions } = await import('../financial-analysis');

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      const patchMock = vi.fn();
      const execMock = vi.fn().mockResolvedValue({
        patch: patchMock,
      });
      const findOneMock = vi.fn().mockReturnValue({ exec: execMock });

      const mockDb = {
        financial_subscriptions: {
          findOne: findOneMock,
        },
      } as any;

      const subscriptions: FinancialSubscription[] = [
        {
          id: 'sub1',
          merchant_name: 'Netflix',
          amount: 15.99,
          frequency: 'monthly',
          is_active: true,
          flagged_unused: false,
          last_used_date: oldDate.toISOString().split('T')[0],
          account_id: 'acc1',
          category: 'subscription',
          scope: 'personal',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = await flagUnusedSubscriptions(mockDb, subscriptions);

      expect(patchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          flagged_unused: true,
        })
      );
      expect(result).toHaveLength(1);
    });

    it('should not flag subscription with recent last_used_date', async () => {
      const { flagUnusedSubscriptions } = await import('../financial-analysis');

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10);

      const findOneMock = vi.fn();

      const mockDb = {
        financial_subscriptions: {
          findOne: findOneMock,
        },
      } as any;

      const subscriptions: FinancialSubscription[] = [
        {
          id: 'sub1',
          merchant_name: 'Netflix',
          amount: 15.99,
          frequency: 'monthly',
          is_active: true,
          flagged_unused: false,
          last_used_date: recentDate.toISOString().split('T')[0],
          account_id: 'acc1',
          category: 'subscription',
          scope: 'personal',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = await flagUnusedSubscriptions(mockDb, subscriptions);

      expect(findOneMock).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });

    it('should not flag inactive subscription', async () => {
      const { flagUnusedSubscriptions } = await import('../financial-analysis');

      const findOneMock = vi.fn();

      const mockDb = {
        financial_subscriptions: {
          findOne: findOneMock,
        },
      } as any;

      const subscriptions: FinancialSubscription[] = [
        {
          id: 'sub1',
          merchant_name: 'Netflix',
          amount: 15.99,
          frequency: 'monthly',
          is_active: false,
          flagged_unused: false,
          account_id: 'acc1',
          category: 'subscription',
          scope: 'personal',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = await flagUnusedSubscriptions(mockDb, subscriptions);

      expect(findOneMock).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });
  });

  describe('analyzeSpending', () => {
    it('should return empty array when no API key', async () => {
      vi.stubEnv('VITE_GEMINI_API_KEY', '');

      const { analyzeSpending } = await import('../financial-analysis');

      const result = await analyzeSpending(null, [], [], []);

      expect(result).toEqual([]);
    });

    it('should return empty array when currentMonth is null', async () => {
      vi.stubEnv('VITE_GEMINI_API_KEY', 'test-api-key');

      const { analyzeSpending } = await import('../financial-analysis');

      const result = await analyzeSpending(null, [], [], []);

      expect(result).toEqual([]);
    });
  });

  describe('recomputeMonthlySummary', () => {
    it('should compute correct totals from transactions', async () => {
      const { recomputeMonthlySummary } = await import('../financial-analysis');

      const transactions: FinancialTransaction[] = [
        // Income (negative amounts per Plaid convention)
        {
          id: '1',
          account_id: 'acc1',
          date: '2025-01-15',
          amount: -3000.0,
          name: 'Salary',
          category: 'income',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-15T00:00:00Z',
          updated_at: '2025-01-15T00:00:00Z',
        },
        {
          id: '2',
          account_id: 'acc1',
          date: '2025-01-20',
          amount: -500.0,
          name: 'Freelance Payment',
          category: 'income',
          scope: 'business',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-20T00:00:00Z',
          updated_at: '2025-01-20T00:00:00Z',
        },
        // Expenses (positive amounts)
        {
          id: '3',
          account_id: 'acc1',
          date: '2025-01-05',
          amount: 100.0,
          name: 'Groceries',
          category: 'food',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-05T00:00:00Z',
          updated_at: '2025-01-05T00:00:00Z',
        },
        {
          id: '4',
          account_id: 'acc1',
          date: '2025-01-10',
          amount: 50.0,
          name: 'GitHub',
          category: 'software',
          scope: 'business',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-10T00:00:00Z',
        },
        {
          id: '5',
          account_id: 'acc1',
          date: '2025-01-12',
          amount: 2000.0,
          name: 'Rent',
          category: 'rent_mortgage',
          scope: 'personal',
          is_recurring: false,
          is_subscription: false,
          pending: false,
          month: '2025-01',
          created_at: '2025-01-12T00:00:00Z',
          updated_at: '2025-01-12T00:00:00Z',
        },
      ];

      // Mock docs with toJSON() like RxDB returns
      const txDocs = transactions.map(tx => ({ toJSON: () => tx }));

      const upsertMock = vi.fn();
      const execMock = vi.fn().mockResolvedValue(txDocs);
      const findMock = vi.fn().mockReturnValue({ exec: execMock });

      const subDocs: any[] = [];
      const subscriptionsExecMock = vi.fn().mockResolvedValue(subDocs);
      const subscriptionsFindMock = vi.fn().mockReturnValue({ exec: subscriptionsExecMock });

      const mockDb = {
        financial_transactions: {
          find: findMock,
        },
        financial_subscriptions: {
          find: subscriptionsFindMock,
        },
        financial_monthly_summaries: {
          upsert: upsertMock,
        },
      } as any;

      await recomputeMonthlySummary(mockDb, '2025-01');

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          month: '2025-01',
          total_income: 3500.0, // 3000 + 500
          total_expenses: 2150.0, // 100 + 50 + 2000
          business_expenses: 50.0, // GitHub
          personal_expenses: 2100.0, // Groceries + Rent
          net_cash_flow: 1350.0, // 3500 - 2150
        })
      );
    });
  });
});
