import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!stripeKey || !webhookSecret) {
      console.error("Missing Stripe environment variables");
      throw new Error("Missing environment variables");
    }

    const stripe = new Stripe(stripeKey, { 
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("Missing stripe-signature header");
      throw new Error("No Stripe signature");
    }

    const body = await req.text();
    let event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      throw new Error(`Webhook Verification Error: ${err.message}`);
    }

    console.log(`Processing event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const userId = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        console.log(`Checkout completed for user ${userId}, customer ${customerId}, subscription ${subscriptionId}`);

        if (userId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const status = subscription.status;
          const tier = (status === "active" || status === "trialing" || status === "past_due") ? "pro" : "free";
          
          let endDate = null;
          let startDate = null;
          try {
            console.log(`Debug Subscription Object [${subscriptionId}]:`, JSON.stringify({
              status: subscription.status,
              current_period_start: subscription.current_period_start,
              current_period_end: subscription.current_period_end,
              trial_start: subscription.trial_start,
              trial_end: subscription.trial_end,
              start_date: subscription.start_date,
              created: subscription.created
            }));

            // Use current_period_end as primary, fallback to trial_end
            const pEnd = subscription.current_period_end || subscription.trial_end;
            if (pEnd) {
              endDate = new Date(pEnd * 1000).toISOString();
            }
            
            // Use current_period_start as primary, fallback to start_date or created
            const pStart = subscription.current_period_start || subscription.start_date || subscription.created;
            if (pStart) {
              startDate = new Date(pStart * 1000).toISOString();
            }
            
            console.log(`Final Dates for User ${userId} - Start: ${startDate}, End: ${endDate}`);
          } catch (e) {
            console.error("Error parsing period dates in checkout:", e);
          }

          const { error } = await supabase
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_status: status,
              subscription_tier: tier,
              subscription_start: startDate,
              subscription_end: endDate,
              display_name: session.customer_details?.name || "",
            })
            .eq("user_id", userId);
            
          if (error) console.error("Error updating profile in checkout.session.completed:", error);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.deleted":
      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        const userId = subscription.metadata?.user_id;

        console.log(`Subscription event ${event.type} for customer ${customerId}, status ${status}, userId from metadata: ${userId}`);
        
        // Se cancelado ou marcado para cancelar, mas ainda não expirado, mantemos como 'pro'
        // Mas se o status for 'canceled', então é realmente inativo
        const isActive = (status === "active" || status === "trialing" || status === "past_due");
        const tier = isActive ? "pro" : "free";
        const dbStatus = (cancelAtPeriodEnd && status !== "canceled") ? "expiring" : status;
        
        let endDate = null;
        let startDate = null;
        try {
          // Use current_period_end as primary, fallback to trial_end
          const pEnd = subscription.current_period_end || subscription.trial_end;
          if (pEnd) {
            endDate = new Date(pEnd * 1000).toISOString();
          }
          // Use current_period_start as primary, fallback to start_date or created
          const pStart = subscription.current_period_start || subscription.start_date || subscription.created;
          if (pStart) {
            startDate = new Date(pStart * 1000).toISOString();
          }
        } catch (e) {
          console.error("Error parsing period dates:", e);
        }

        console.log(`Updating subscription info. Stripe Status: ${status}, CancelAtEnd: ${cancelAtPeriodEnd}, Mapped Status: ${dbStatus}, Tier: ${tier}, EndDate: ${endDate}`);

        // Try localizando pelo user_id primeiro se disponível na metadata
        if (userId) {
          const { error: errorById } = await supabase
            .from("profiles")
            .update({
              stripe_customer_id: customerId, // ensure customer ID is mapped
              stripe_status: dbStatus,
              subscription_tier: tier,
              subscription_start: startDate,
              subscription_end: endDate,
            })
            .eq("user_id", userId);
          
          if (!errorById) {
            console.log(`Successfully updated profile by user_id: ${userId}`);
            break;
          }
        }

        // Fallback para localizar pelo stripe_customer_id
        const { error: errorByCust } = await supabase
          .from("profiles")
          .update({
            stripe_status: dbStatus,
            subscription_tier: tier,
            subscription_start: startDate,
            subscription_end: endDate,
          })
          .eq("stripe_customer_id", customerId);

        if (errorByCust) {
          console.error(`Error updating profile for customer ${customerId}:`, errorByCust);
        } else {
          console.log(`Successfully updated profile for customer ${customerId}`);
        }
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("WEBHOOK ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
