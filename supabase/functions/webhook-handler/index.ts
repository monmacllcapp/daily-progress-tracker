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
    const body = await req.json();
    const { webhook_type, webhook_code, item_id, error: plaidError } = body;

    console.log(`[Plaid Webhook] type=${webhook_type} code=${webhook_code} item=${item_id}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (webhook_type === 'TRANSACTIONS') {
      if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
        // Trigger a sync by calling our sync-transactions function
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        await fetch(`${supabaseUrl}/functions/v1/sync-transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ item_id }),
        });

        console.log(`[Plaid Webhook] Triggered sync for item ${item_id}`);
      }
    }

    if (webhook_type === 'ITEM') {
      if (webhook_code === 'ERROR') {
        console.error(`[Plaid Webhook] Item error for ${item_id}:`, plaidError);
        // Update the plaid_items table with error info
        await supabase.from('plaid_items').update({
          error_code: plaidError?.error_code || 'UNKNOWN',
          updated_at: new Date().toISOString(),
        }).eq('id', item_id);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Plaid Webhook] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
