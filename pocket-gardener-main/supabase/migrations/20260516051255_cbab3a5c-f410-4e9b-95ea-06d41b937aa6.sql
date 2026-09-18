
-- Add new columns to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Trigger to append to status_history on status change
CREATE OR REPLACE FUNCTION public.append_booking_status_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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

DROP TRIGGER IF EXISTS trg_bookings_status_history ON public.bookings;
CREATE TRIGGER trg_bookings_status_history
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.append_booking_status_history();

-- Storage bucket for booking photos (public read so URLs render directly)
INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-photos', 'booking-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users upload/read/delete only their own folder (prefix = user_id)
DROP POLICY IF EXISTS "booking photos public read" ON storage.objects;
CREATE POLICY "booking photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'booking-photos');

DROP POLICY IF EXISTS "booking photos user insert" ON storage.objects;
CREATE POLICY "booking photos user insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'booking-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "booking photos user delete" ON storage.objects;
CREATE POLICY "booking photos user delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'booking-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
