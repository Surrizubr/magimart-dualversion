
-- Drop in case it was created by a previous partial migration
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;

-- Allow reading profiles (for subscription check via anon key)
CREATE POLICY "Profiles are publicly readable"
ON public.profiles FOR SELECT
TO anon, authenticated
USING (true);
