-- Jalankan di Supabase > SQL Editor. Aman dijalankan berulang (idempotent).
-- Menyesuaikan tabel dengan kebutuhan kode backend. Sesuaikan jika tabel kamu sudah punya kolom lain.

create extension if not exists pgcrypto;

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'rafting',
  price_strike numeric,
  price_per_pax numeric not null default 0,
  min_pax integer not null default 1,
  features text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
alter table packages add column if not exists category text not null default 'rafting';
alter table packages add column if not exists price_strike numeric;
alter table packages add column if not exists price_per_pax numeric not null default 0;
alter table packages add column if not exists min_pax integer not null default 1;
alter table packages add column if not exists features text;
alter table packages add column if not exists is_active boolean not null default true;

create table if not exists slot_capacities (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  time_slot text not null,
  max_capacity integer not null default 50,
  booked_pax integer not null default 0,
  is_manual_full boolean not null default false
);
create unique index if not exists slot_capacities_date_slot_uq on slot_capacities (slot_date, time_slot);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null,
  package_id uuid,
  package_name text,
  customer_name text not null,
  customer_phone text not null,
  booking_date date not null,
  time_slot text not null,
  total_pax integer not null,
  total_price numeric not null,
  payment_type text,
  payment_status text not null default 'PENDING',
  created_at timestamptz default now()
);
alter table bookings add column if not exists package_name text;
create unique index if not exists bookings_code_uq on bookings (booking_code);

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  content text not null,
  image_url text,
  category text,
  published_at timestamptz default now()
);
create unique index if not exists articles_slug_uq on articles (slug);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  is_approved boolean not null default false,
  created_at timestamptz default now()
);
