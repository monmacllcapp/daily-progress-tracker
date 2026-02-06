import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function callEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.functions.invoke(name, {
    body,
  });

  if (error) throw new Error(error.message || `Edge function ${name} failed`);
  return data as T;
}

export async function createLinkToken(): Promise<string> {
  const result = await callEdgeFunction<{ link_token: string }>('create-link-token', {});
  return result.link_token;
}

export async function exchangePublicToken(
  publicToken: string
): Promise<{ item_id: string; accounts: PlaidAccountInfo[] }> {
  return callEdgeFunction('exchange-token', { public_token: publicToken });
}

export async function syncTransactions(
  itemId: string
): Promise<{ added: number; modified: number; removed: number }> {
  return callEdgeFunction('sync-transactions', { item_id: itemId });
}

export interface PlaidAccountInfo {
  plaid_account_id: string;
  plaid_item_id: string;
  institution_name: string;
  account_name: string;
  account_type: string;
  mask?: string;
  current_balance: number;
  available_balance?: number;
  currency: string;
}

export function isPlaidConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export async function getLinkedAccounts(
  db: import('../db').TitanDatabase
): Promise<import('../types/schema').FinancialAccount[]> {
  const docs = await db.financial_accounts.find({
    selector: { is_active: true },
  }).exec();
  return docs.map(d => d.toJSON() as import('../types/schema').FinancialAccount);
}

export async function saveAccountsToDb(
  db: import('../db').TitanDatabase,
  accounts: PlaidAccountInfo[],
  scope: 'business' | 'personal'
): Promise<void> {
  for (const acc of accounts) {
    await db.financial_accounts.upsert({
      id: acc.plaid_account_id,
      plaid_account_id: acc.plaid_account_id,
      plaid_item_id: acc.plaid_item_id,
      institution_name: acc.institution_name,
      account_name: acc.account_name,
      account_type: acc.account_type as import('../types/schema').AccountType,
      account_scope: scope,
      mask: acc.mask,
      current_balance: acc.current_balance,
      available_balance: acc.available_balance,
      currency: acc.currency,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}
