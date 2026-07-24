-- =========================================================================
-- MIGRATION: 20260724060000_add_pdf_export_format.sql
-- Adds PDF format support and firms export type to export_jobs table
-- =========================================================================

BEGIN;

-- Update format constraint to include PDF
ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_format_check;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_format_check 
  CHECK (format IN ('CSV', 'XLSX', 'PDF'));

-- Ensure firms is in the export_type constraint (it may already be there)
ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_export_type_check;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_export_type_check 
  CHECK (export_type IN ('members', 'firms', 'payments', 'certificates', 'audit_logs'));

COMMIT;
