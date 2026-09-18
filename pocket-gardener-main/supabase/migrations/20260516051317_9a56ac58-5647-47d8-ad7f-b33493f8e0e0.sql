
DROP POLICY IF EXISTS "booking photos public read" ON storage.objects;
CREATE POLICY "booking photos owner list"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'booking-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
