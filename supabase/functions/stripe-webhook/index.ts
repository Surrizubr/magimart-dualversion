import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const stripe = new Stripe(stripeKey, { 
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("Sem assinatura do Stripe");

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    console.log(`Evento recebido: ${event.type}`);

    let customerId = "";
    let userId = "";
    let status = "";
    let subscriptionId = "";

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      userId = session.client_reference_id;
      customerId = session.customer;
      subscriptionId = session.subscription;
    } else if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object as any;
      customerId = subscription.customer;
      userId = subscription.metadata?.user_id;
      subscriptionId = subscription.id;
    }

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      status = subscription.status;
      const tier = (status === "active" || status === "trialing" || status === "past_due") ? "pro" : "free";

      let startDate = null;
      let endDate = null;

      // Cálculo das datas: Início do pagamento e +1 ano para o fim
      try {
        const pStart = subscription.current_period_start || subscription.created;
        if (pStart) {
          const startObj = new Date(pStart * 1000);
          startDate = startObj.toISOString();

          // Calcula exatamente 1 ano depois conforme solicitado
          const endObj = new Date(startObj);
          endObj.setFullYear(endObj.getFullYear() + 1);
          endDate = endObj.toISOString();
        }
        console.log(`Datas calculadas - Início: ${startDate}, Fim (1 ano): ${endDate}`);
      } catch (e) {
        console.error("Erro ao processar datas:", e);
      }

      // Atualiza o perfil
      const updateData = {
        stripe_customer_id: customerId,
        stripe_status: status,
        subscription_tier: tier,
        subscription_start: startDate,
        subscription_end: endDate,
      };

      let query = supabase.from("profiles").update(updateData);

      if (userId) {
        query = query.eq("user_id", userId);
      } else {
        query = query.eq("stripe_customer_id", customerId);
      }

      const { error } = await query;
      if (error) throw error;
      console.log(`Perfil atualizado com sucesso para o usuário ${userId || customerId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Erro no Webhook:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
