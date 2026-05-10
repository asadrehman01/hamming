-- Create storage buckets used by app components
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('customer-docs', 'customer-docs', false),
  ('trainer-docs', 'trainer-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (authenticated users scoped by first folder = gym_id)
-- customer-docs
DROP POLICY IF EXISTS customer_docs_select ON storage.objects;
CREATE POLICY customer_docs_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS customer_docs_insert ON storage.objects;
CREATE POLICY customer_docs_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'customer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS customer_docs_update ON storage.objects;
CREATE POLICY customer_docs_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'customer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'customer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS customer_docs_delete ON storage.objects;
CREATE POLICY customer_docs_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- trainer-docs
DROP POLICY IF EXISTS trainer_docs_select ON storage.objects;
CREATE POLICY trainer_docs_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trainer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS trainer_docs_insert ON storage.objects;
CREATE POLICY trainer_docs_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trainer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS trainer_docs_update ON storage.objects;
CREATE POLICY trainer_docs_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trainer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'trainer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS trainer_docs_delete ON storage.objects;
CREATE POLICY trainer_docs_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'trainer-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
