CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_category TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_phone TEXT,
  provider_address TEXT,
  provider_lat DOUBLE PRECISION,
  provider_lng DOUBLE PRECISION,
  provider_rating NUMERIC,
  distance_km NUMERIC,
  scheduled_for TIMESTAMPTZ,
  user_address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_reasoning TEXT,
  photo_urls text[] NOT NULL DEFAULT '{}',
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bookings select" ON public.bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own bookings insert" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own bookings update" ON public.bookings FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX bookings_user_idx ON public.bookings(user_id, created_at DESC);

CREATE TABLE public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  reasoning TEXT,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs select" ON public.agent_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own logs insert" ON public.agent_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX agent_logs_user_idx ON public.agent_logs(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.append_booking_status_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_history := COALESCE(NEW.status_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('status', NEW.status, 'at', now())
    );
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_status_history
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.append_booking_status_history();

INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-photos', 'booking-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "booking photos owner list"
ON storage.objects FOR SELECT
USING (bucket_id = 'booking-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "booking photos user insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'booking-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "booking photos user delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'booking-photos' AND auth.uid()::text = (storage.foldername(name))[1]);