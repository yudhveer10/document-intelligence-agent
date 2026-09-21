create extension if not exists pgcrypto;

create type public.invoice_status as enum (
  'uploaded', 'processing', 'extracted', 'needs_review', 'approved', 'failed'
);

create type public.invoice_source_type as enum ('digital_pdf', 'scanned_pdf', 'excel');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_name text,
  invoice_number text,
  invoice_date date,
  grand_total numeric(18, 4),
  currency char(3),
  status public.invoice_status not null default 'uploaded',
  overall_confidence numeric(5, 4) not null default 0 check (overall_confidence between 0 and 1),
  uncertain_fields jsonb not null default '[]'::jsonb,
  validation_issues jsonb not null default '[]'::jsonb,
  raw_source_reference text not null,
  original_file_name text not null,
  stored_file_name text not null unique,
  mime_type text not null,
  source_type public.invoice_source_type,
  extraction_metadata jsonb not null default '{}'::jsonb,
  raw_model_output jsonb,
  manually_corrected_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currency_is_uppercase check (currency is null or currency = upper(currency))
);

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text,
  quantity numeric(18, 6),
  unit_price numeric(18, 4),
  line_total numeric(18, 4),
  confidence numeric(5, 4) not null default 0 check (confidence between 0 and 1),
  needs_review boolean not null default true,
  manually_corrected boolean not null default false,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, position)
);

create index invoices_status_created_at_idx on public.invoices(status, created_at desc);
create index invoices_vendor_name_idx on public.invoices(vendor_name);
create index invoices_invoice_number_idx on public.invoices(invoice_number);
create index line_items_invoice_id_position_idx on public.line_items(invoice_id, position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger invoices_set_updated_at before update on public.invoices
for each row execute function public.set_updated_at();

create trigger line_items_set_updated_at before update on public.line_items
for each row execute function public.set_updated_at();

create or replace function public.replace_invoice_data(
  p_invoice_id uuid,
  p_data jsonb,
  p_lines jsonb,
  p_is_correction boolean
)
returns void
language plpgsql
as $$
begin
  if p_is_correction then
    update public.invoices
    set vendor_name = p_data->>'vendor_name',
        invoice_number = p_data->>'invoice_number',
        invoice_date = (p_data->>'invoice_date')::date,
        currency = p_data->>'currency',
        grand_total = (p_data->>'grand_total')::numeric,
        status = (p_data->>'status')::public.invoice_status,
        overall_confidence = (p_data->>'overall_confidence')::numeric,
        uncertain_fields = p_data->'uncertain_fields',
        validation_issues = p_data->'validation_issues',
        manually_corrected_fields = p_data->'manually_corrected_fields'
    where id = p_invoice_id;
  else
    update public.invoices
    set vendor_name = p_data->>'vendor_name',
        invoice_number = p_data->>'invoice_number',
        invoice_date = (p_data->>'invoice_date')::date,
        currency = p_data->>'currency',
        grand_total = (p_data->>'grand_total')::numeric,
        status = (p_data->>'status')::public.invoice_status,
        overall_confidence = (p_data->>'overall_confidence')::numeric,
        uncertain_fields = p_data->'uncertain_fields',
        validation_issues = p_data->'validation_issues',
        source_type = (p_data->>'source_type')::public.invoice_source_type,
        extraction_metadata = p_data->'extraction_metadata',
        raw_model_output = p_data->'raw_model_output'
    where id = p_invoice_id;
  end if;

  if not found then
    raise exception 'invoice not found';
  end if;

  delete from public.line_items where invoice_id = p_invoice_id;
  insert into public.line_items (
    invoice_id, description, quantity, unit_price, line_total,
    confidence, needs_review, manually_corrected, position
  )
  select
    p_invoice_id,
    nullif(item->>'description', ''),
    nullif(item->>'quantity', '')::numeric,
    nullif(item->>'unit_price', '')::numeric,
    nullif(item->>'line_total', '')::numeric,
    (item->>'confidence')::numeric,
    (item->>'needs_review')::boolean,
    (item->>'manually_corrected')::boolean,
    (item->>'position')::integer
  from jsonb_array_elements(p_lines) as item;
end;
$$;

comment on table public.invoices is 'One document-level extraction and review record. Nullable business fields preserve unreadable input without fabrication.';
comment on column public.invoices.grand_total is 'Decimal-compatible amount; numeric avoids binary floating-point storage.';
comment on column public.invoices.raw_source_reference is 'Application-relative source endpoint, never an arbitrary filesystem path.';
