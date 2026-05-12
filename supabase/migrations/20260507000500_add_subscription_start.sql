
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_start timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_device_id text;
