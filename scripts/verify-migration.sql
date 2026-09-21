begin;

insert into public.invoices (
  id, original_file_name, stored_file_name, mime_type, raw_source_reference
) values (
  'f7559efb-00f8-44aa-ac4c-f21c7cf62ab1',
  'verification.pdf',
  'verification-safe.pdf',
  'application/pdf',
  '/api/documents/f7559efb-00f8-44aa-ac4c-f21c7cf62ab1/source'
);

select public.replace_invoice_data(
  'f7559efb-00f8-44aa-ac4c-f21c7cf62ab1',
  '{
    "vendor_name": "Verification Vendor",
    "invoice_number": "VERIFY-1",
    "invoice_date": "2026-08-20",
    "currency": "USD",
    "grand_total": "24.50",
    "status": "extracted",
    "overall_confidence": 0.94,
    "uncertain_fields": [],
    "validation_issues": [],
    "source_type": "digital_pdf",
    "extraction_metadata": {"pages": 1},
    "raw_model_output": {"invoiceNumber": "VERIFY-1"}
  }'::jsonb,
  '[
    {
      "description": "Validation item",
      "quantity": "2",
      "unit_price": "12.25",
      "line_total": "24.50",
      "confidence": 0.95,
      "needs_review": false,
      "manually_corrected": false,
      "position": 0
    }
  ]'::jsonb,
  false
);

do $$
declare
  amount numeric;
  line_count integer;
  invoice_status public.invoice_status;
begin
  select grand_total, status into amount, invoice_status
  from public.invoices where id = 'f7559efb-00f8-44aa-ac4c-f21c7cf62ab1';
  select count(*) into line_count
  from public.line_items where invoice_id = 'f7559efb-00f8-44aa-ac4c-f21c7cf62ab1';
  if amount <> 24.50 or invoice_status <> 'extracted' or line_count <> 1 then
    raise exception 'atomic save verification failed';
  end if;

  begin
    perform public.replace_invoice_data(
      'f7559efb-00f8-44aa-ac4c-f21c7cf62ab1',
      '{
        "vendor_name": "Should Roll Back",
        "invoice_number": "VERIFY-1",
        "invoice_date": "2026-08-20",
        "currency": "USD",
        "grand_total": "24.50",
        "status": "needs_review",
        "overall_confidence": 0.20,
        "uncertain_fields": [],
        "validation_issues": [],
        "source_type": "digital_pdf",
        "extraction_metadata": {},
        "raw_model_output": {}
      }'::jsonb,
      '[
        {
          "description": "Invalid position",
          "quantity": "2",
          "unit_price": "12.25",
          "line_total": "24.50",
          "confidence": 0.95,
          "needs_review": false,
          "manually_corrected": false,
          "position": -1
        }
      ]'::jsonb,
      false
    );
    raise exception 'invalid line unexpectedly saved';
  exception when check_violation then
    null;
  end;

  select status into invoice_status
  from public.invoices where id = 'f7559efb-00f8-44aa-ac4c-f21c7cf62ab1';
  select count(*) into line_count
  from public.line_items where invoice_id = 'f7559efb-00f8-44aa-ac4c-f21c7cf62ab1';
  if invoice_status <> 'extracted' or line_count <> 1 then
    raise exception 'failed save did not roll back';
  end if;
end;
$$;

rollback;
