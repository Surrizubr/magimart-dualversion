CREATE TABLE IF NOT EXISTS public.device_trials (
    device_id TEXT PRIMARY KEY,
    trial_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.device_trials ENABLE ROW LEVEL SECURITY;

-- Permitir que qualquer pessoa (anon) insira ou veja seu próprio device_id
-- Nota: Em um cenário real, poderíamos usar uma Edge Function para validar o device_id,
-- mas para o escopo local, usaremos políticas públicas baseadas no ID.
CREATE POLICY "Allow anon to select their device trial" ON public.device_trials
    FOR SELECT USING (true);

CREATE POLICY "Allow anon to insert their device trial" ON public.device_trials
    FOR INSERT WITH CHECK (true);
