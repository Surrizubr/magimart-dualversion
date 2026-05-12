-- MIGRATION: Add new columns for subscription tracking and multi-device support
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_start timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_device_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_status text DEFAULT 'inactive';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_end timestamp with time zone;

-- Ensure RLS is updated if needed (usually profiles are already open for users)
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
