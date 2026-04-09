-- Performance: add covering index for certificate_downloads.certificate_id foreign key

CREATE INDEX IF NOT EXISTS idx_certificate_downloads_certificate_id
  ON public.certificate_downloads (certificate_id);
