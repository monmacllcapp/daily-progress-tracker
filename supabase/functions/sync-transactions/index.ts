import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map Plaid categories to our TransactionCategory
function mapPlaidCategory(plaidCategories: string[]): string {
  if (!plaidCategories || plaidCategories.length === 0) return 'other';
  const primary = plaidCategories[0]?.toLowerCase() || '';
  const secondary = plaidCategories[1]?.toLowerCase() || '';

  if (primary === 'transfer' || primary === 'payment') return 'transfer';
  if (primary === 'income' || primary.includes('payroll') || primary.includes('deposit')) return 'income';
  if (primary.includes('food') || secondary.includes('restaurant') || secondary.includes('groceries')) return 'food';
  if (primary.includes('travel') || secondary.includes('airlines') || secondary.includes('hotel')) return 'travel';
  if (primary.includes('entertainment') || secondary.includes('music') || secondary.includes('streaming')) return 'entertainment';
  if (primary.includes('medical') || secondary.includes('health')) return 'healthcare';
  if (primary.includes('tax')) return 'taxes';
  if (primary.includes('insurance')) return 'insurance';
  if (primary.includes('education')) return 'education';
  if (primary.includes('rent') || secondary.includes('mortgage')) return 'rent_mortgage';
  if (secondary.includes('utilities') || secondary.includes('electric') || secondary.includes('gas') || secondary.includes('water')) return 'utilities';
  if (secondary.includes('software') || secondary.includes('saas')) return 'software';
  if (secondary.includes('advertising') || secondary.includes('marketing')) return 'marketing';
  if (secondary.includes('office')) return 'office';
  return 'other';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { item_id } = await req.json();
    if (!item_id) {
      return new Response(JSON.stringify({ error: 'item_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
    const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
    const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get access token and cursor from plaid_items
    const { data: plaidItem, error: itemError } = await supabase
      .from('plaid_items')
      .select('access_token, cursor')
      .eq('id', item_id)
      .single();

    if (itemError || !plaidItem) {
      return new Response(JSON.stringify({ error: 'Plaid item not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let cursor = plaidItem.cursor || undefined;
    let added: any[] = [];
    let modified: any[] = [];
    let removed: string[] = [];
    let hasMore = true;

    // Paginate through transactions/sync
    while (hasMore) {
      const syncBody: any = {
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: plaidItem.access_token,
      };
      if (cursor) syncBody.cursor = cursor;

      const syncRes = await fetch(`https://${PLAID_ENV}.plaid.com/transactions/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      });

      const syncData = await syncRes.json();
      if (!syncRes.ok) {
        return new Response(JSON.stringify({ error: syncData.error_message || 'Sync failed' }), {
          status: syncRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      added = added.concat(syncData.added || []);
      modified = modified.concat(syncData.modified || []);
      removed = removed.concat((syncData.removed || []).map((r: any) => r.transaction_id));
      hasMore = syncData.has_more;
      cursor = syncData.next_cursor;
    }

    // Save cursor for next sync
    await supabase.from('plaid_items').update({
      cursor,
      updated_at: new Date().toISOString(),
    }).eq('id', item_id);

    // Map and upsert added/modified transactions into financial_transactions
    const mappedTransactions = [...added, ...modified].map((tx: any) => ({
      id: tx.transaction_id,
      account_id: tx.account_id,
      plaid_transaction_id: tx.transaction_id,
      date: tx.date,
      amount: tx.amount, // positive = expense per Plaid convention
      name: tx.name,
      merchant_name: tx.merchant_name || tx.name,
      category: mapPlaidCategory(tx.category || []),
      plaid_category: (tx.category || []).join(' > '),
      scope: 'personal', // default, user can override
      is_recurring: tx.is_recurring || false,
      is_subscription: false,
      pending: tx.pending || false,
      month: tx.date.substring(0, 7),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    if (mappedTransactions.length > 0) {
      const { error: upsertError } = await supabase
        .from('financial_transactions')
        .upsert(mappedTransactions);
      if (upsertError) console.error('Upsert error:', upsertError);
    }

    // Remove deleted transactions
    if (removed.length > 0) {
      await supabase.from('financial_transactions').delete().in('id', removed);
    }

    // Update account balances
    const accountsRes = await fetch(`https://${PLAID_ENV}.plaid.com/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: plaidItem.access_token,
      }),
    });
    const accountsData = await accountsRes.json();
    for (const acc of accountsData.accounts || []) {
      await supabase.from('financial_accounts').update({
        current_balance: acc.balances?.current || 0,
        available_balance: acc.balances?.available,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('plaid_account_id', acc.account_id);
    }

    return new Response(JSON.stringify({
      added: added.length,
      modified: modified.length,
      removed: removed.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
