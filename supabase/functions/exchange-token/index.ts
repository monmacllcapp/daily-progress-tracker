import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { public_token } = await req.json();
    if (!public_token) {
      return new Response(JSON.stringify({ error: 'public_token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
    const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
    const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';

    // Exchange public token for access token
    const exchangeRes = await fetch(`https://${PLAID_ENV}.plaid.com/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token,
      }),
    });

    const exchangeData = await exchangeRes.json();
    if (!exchangeRes.ok) {
      return new Response(JSON.stringify({ error: exchangeData.error_message || 'Token exchange failed' }), {
        status: exchangeRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token, item_id } = exchangeData;

    // Store access token securely in plaid_items (only service_role can access due to RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('plaid_items').upsert({
      id: item_id,
      access_token,
      item_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Fetch accounts from Plaid
    const accountsRes = await fetch(`https://${PLAID_ENV}.plaid.com/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token,
      }),
    });

    const accountsData = await accountsRes.json();
    const accounts = (accountsData.accounts || []).map((acc: any) => ({
      plaid_account_id: acc.account_id,
      plaid_item_id: item_id,
      institution_name: accountsData.item?.institution_id || 'Unknown',
      account_name: acc.name,
      account_type: acc.type || 'other',
      mask: acc.mask,
      current_balance: acc.balances?.current || 0,
      available_balance: acc.balances?.available,
      currency: acc.balances?.iso_currency_code || 'USD',
    }));

    return new Response(JSON.stringify({ item_id, accounts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
