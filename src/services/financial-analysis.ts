import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TitanDatabase } from '../db';
import type {
  FinancialTransaction,
  FinancialSubscription,
  FinancialMonthlySummary,
  TransactionCategory,
  TransactionScope,
  SubscriptionFrequency,
} from '../types/schema';
import { sanitizeForPrompt } from '../utils/sanitize-prompt';

// Gemini singleton (same pattern as ai-advisor.ts)
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI | null {
  if (genAI) return genAI;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

// --- Subscription Detection ---

function detectFrequency(dates: string[]): SubscriptionFrequency | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d1 = new Date(sorted[i - 1]);
    const d2 = new Date(sorted[i]);
    gaps.push(Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  if (avgGap <= 10) return 'weekly';
  if (avgGap >= 25 && avgGap <= 35) return 'monthly';
  if (avgGap >= 80 && avgGap <= 100) return 'quarterly';
  if (avgGap >= 340 && avgGap <= 400) return 'annual';
  return null;
}

export async function detectSubscriptions(
  db: TitanDatabase,
  transactions: FinancialTransaction[]
): Promise<FinancialSubscription[]> {
  // Group transactions by merchant
  const merchantGroups = new Map<string, FinancialTransaction[]>();
  for (const tx of transactions) {
    if (tx.amount <= 0) continue; // skip credits/income
    const key = (tx.merchant_name || tx.name).toLowerCase().trim();
    if (!merchantGroups.has(key)) merchantGroups.set(key, []);
    merchantGroups.get(key)!.push(tx);
  }

  const subscriptions: FinancialSubscription[] = [];

  for (const [merchant, txs] of merchantGroups) {
    if (txs.length < 2) continue;

    // Check if amounts are similar (within 20%)
    const amounts = txs.map(t => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const allSimilar = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.2);
    if (!allSimilar) continue;

    // Check for recurring frequency
    const dates = txs.map(t => t.date);
    const frequency = detectFrequency(dates);
    if (!frequency) continue;

    const sortedTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const lastTx = sortedTxs[0];

    // Calculate next expected date
    const lastDate = new Date(lastTx.date);
    const daysToAdd = frequency === 'weekly' ? 7 : frequency === 'monthly' ? 30 : frequency === 'quarterly' ? 90 : 365;
    const nextDate = new Date(lastDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    subscriptions.push({
      id: `sub_${merchant.replace(/[^a-z0-9]/g, '_')}`,
      account_id: lastTx.account_id,
      merchant_name: lastTx.merchant_name || lastTx.name,
      amount: Math.round(avgAmount * 100) / 100,
      frequency,
      category: lastTx.category,
      scope: lastTx.scope,
      is_active: true,
      last_charge_date: lastTx.date,
      next_expected_date: nextDate.toISOString().split('T')[0],
      flagged_unused: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert detected subscriptions into DB
  for (const sub of subscriptions) {
    try {
      await db.financial_subscriptions.upsert(sub);
    } catch (err) {
      console.warn('[financial-analysis] Failed to upsert subscription:', err);
    }
  }

  return subscriptions;
}

// --- Flag Unused Subscriptions ---

export async function flagUnusedSubscriptions(
  db: TitanDatabase,
  subscriptions: FinancialSubscription[]
): Promise<FinancialSubscription[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  const flagged: FinancialSubscription[] = [];

  for (const sub of subscriptions) {
    if (!sub.is_active) continue;

    // Flag if last used date is >30 days ago or never used
    const isUnused = !sub.last_used_date || sub.last_used_date < cutoff;

    if (isUnused && !sub.flagged_unused) {
      try {
        const doc = await db.financial_subscriptions.findOne(sub.id).exec();
        if (doc) {
          await doc.patch({ flagged_unused: true, updated_at: new Date().toISOString() });
        }
      } catch (err) {
        console.warn('[financial-analysis] Failed to flag subscription:', err);
      }
      flagged.push({ ...sub, flagged_unused: true });
    }
  }

  return flagged;
}

// --- AI Spending Analysis ---

export interface SpendingInsight {
  type: 'anomaly' | 'trend' | 'optimization' | 'alert';
  severity: 'info' | 'warning' | 'alert';
  title: string;
  description: string;
  amount?: number;
  category?: TransactionCategory;
}

export async function analyzeSpending(
  currentMonth: FinancialMonthlySummary | null,
  previousMonths: FinancialMonthlySummary[],
  subscriptions: FinancialSubscription[],
  recentTransactions: FinancialTransaction[]
): Promise<SpendingInsight[]> {
  const ai = getGenAI();
  if (!ai || !currentMonth) return [];

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const unusedSubs = subscriptions.filter(s => s.flagged_unused);
    const monthHistory = previousMonths.slice(0, 5).map(m => ({
      month: m.month,
      income: m.total_income,
      expenses: m.total_expenses,
      net: m.net_cash_flow,
    }));

    const topSpending = recentTransactions
      .filter(t => t.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map(t => ({ name: sanitizeForPrompt(t.name, 150), amount: t.amount, category: t.category }));

    const prompt = `You are a financial advisor analyzing personal/business spending data.

Current month (${currentMonth.month}):
- Income: $${currentMonth.total_income.toFixed(2)}
- Expenses: $${currentMonth.total_expenses.toFixed(2)}
- Net Cash Flow: $${currentMonth.net_cash_flow.toFixed(2)}
- Business Income: $${currentMonth.business_income.toFixed(2)}
- Business Expenses: $${currentMonth.business_expenses.toFixed(2)}
- Subscription Burn: $${currentMonth.subscription_burn.toFixed(2)}

Previous months: ${JSON.stringify(monthHistory)}

Top recent expenses: ${JSON.stringify(topSpending)}

Unused subscriptions (no activity in 30+ days): ${unusedSubs.map(s => `${sanitizeForPrompt(s.merchant_name, 100)} ($${s.amount}/${s.frequency})`).join(', ') || 'none'}

Provide 3-5 actionable insights. For each, specify:
- type: "anomaly" | "trend" | "optimization" | "alert"
- severity: "info" | "warning" | "alert"
- title: short headline
- description: 1-2 sentences with specific numbers

Respond ONLY with a JSON array of insights. No markdown, no code blocks.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Parse JSON (handle possible markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const insights: SpendingInsight[] = JSON.parse(jsonMatch[0]);
    return insights.filter(
      i => i.type && i.severity && i.title && i.description
    );
  } catch (err) {
    console.warn('[financial-analysis] AI analysis failed:', err);
    return [];
  }
}

// --- Transaction Categorization ---

const CATEGORY_RULES: Record<string, TransactionCategory> = {
  'netflix': 'subscription',
  'spotify': 'subscription',
  'hulu': 'subscription',
  'disney': 'subscription',
  'amazon prime': 'subscription',
  'adobe': 'software',
  'github': 'software',
  'slack': 'software',
  'notion': 'software',
  'openai': 'software',
  'google ads': 'marketing',
  'facebook ads': 'marketing',
  'meta ads': 'marketing',
  'uber eats': 'food',
  'doordash': 'food',
  'grubhub': 'food',
  'starbucks': 'food',
  'mcdonald': 'food',
  'uber': 'travel',
  'lyft': 'travel',
  'airbnb': 'travel',
  'insurance': 'insurance',
  'geico': 'insurance',
  'state farm': 'insurance',
  'electric': 'utilities',
  'water': 'utilities',
  'gas bill': 'utilities',
  'comcast': 'utilities',
  'at&t': 'utilities',
  'verizon': 'utilities',
  'rent': 'rent_mortgage',
  'mortgage': 'rent_mortgage',
  'payroll': 'payroll',
  'gusto': 'payroll',
  'adp': 'payroll',
};

export function categorizeTransaction(
  transaction: Pick<FinancialTransaction, 'name' | 'merchant_name' | 'plaid_category'>
): { category: TransactionCategory; scope: TransactionScope } {
  const name = (transaction.merchant_name || transaction.name).toLowerCase();

  // Rule-based matching
  for (const [keyword, category] of Object.entries(CATEGORY_RULES)) {
    if (name.includes(keyword)) {
      const businessKeywords = ['software', 'marketing', 'payroll', 'office', 'professional_services'];
      const scope: TransactionScope = businessKeywords.includes(category) ? 'business' : 'personal';
      return { category, scope };
    }
  }

  return { category: 'other', scope: 'personal' };
}

// --- Monthly Summary Recomputation ---

export async function recomputeMonthlySummary(
  db: TitanDatabase,
  month: string
): Promise<void> {
  // Get all transactions for this month
  const allTxDocs = await db.financial_transactions.find().exec();
  const monthTxs = allTxDocs
    .map(d => d.toJSON() as FinancialTransaction)
    .filter(tx => tx.month === month);

  // Get active subscriptions
  const subDocs = await db.financial_subscriptions.find({
    selector: { is_active: true },
  }).exec();
  const subs = subDocs.map(d => d.toJSON() as FinancialSubscription);

  // Calculate totals
  const income = monthTxs.filter(tx => tx.amount < 0); // negative = credit/income in Plaid
  const expenses = monthTxs.filter(tx => tx.amount > 0); // positive = expense in Plaid

  const totalIncome = Math.abs(income.reduce((sum, tx) => sum + tx.amount, 0));
  const totalExpenses = expenses.reduce((sum, tx) => sum + tx.amount, 0);

  const businessIncome = Math.abs(
    income.filter(tx => tx.scope === 'business').reduce((sum, tx) => sum + tx.amount, 0)
  );
  const businessExpenses = expenses
    .filter(tx => tx.scope === 'business')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const personalIncome = Math.abs(
    income.filter(tx => tx.scope === 'personal').reduce((sum, tx) => sum + tx.amount, 0)
  );
  const personalExpenses = expenses
    .filter(tx => tx.scope === 'personal')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const subscriptionBurn = subs.reduce((sum, s) => {
    if (s.frequency === 'monthly') return sum + s.amount;
    if (s.frequency === 'weekly') return sum + s.amount * 4.33;
    if (s.frequency === 'quarterly') return sum + s.amount / 3;
    if (s.frequency === 'annual') return sum + s.amount / 12;
    return sum;
  }, 0);

  // Top categories by spend
  const categoryTotals: Record<string, number> = {};
  for (const tx of expenses) {
    categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
  }
  const topCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }));

  await db.financial_monthly_summaries.upsert({
    id: month,
    month,
    total_income: Math.round(totalIncome * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    net_cash_flow: Math.round((totalIncome - totalExpenses) * 100) / 100,
    business_income: Math.round(businessIncome * 100) / 100,
    business_expenses: Math.round(businessExpenses * 100) / 100,
    personal_income: Math.round(personalIncome * 100) / 100,
    personal_expenses: Math.round(personalExpenses * 100) / 100,
    subscription_burn: Math.round(subscriptionBurn * 100) / 100,
    top_categories: JSON.stringify(topCategories),
    ai_insights: '[]',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
