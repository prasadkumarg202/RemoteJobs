-- Testing option: sign up / sign in with email + password next to mobile OTP.
-- Switched on in /admin/subscribers ("Allow email + password sign-in", stored as app_settings.access.email_login)
-- or with EMAIL_LOGIN=on in the website env. Email accounts follow the same rules: one device, trial, plan.

alter table public.profiles add column if not exists email text;
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Profile gets the phone or the email of the auth user (phone may be '' for email accounts).
create or replace function public.mk_jobs_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email, display_name)
  values (new.id, nullif(new.phone, ''), nullif(lower(new.email), ''), coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.bind_device(p_device_hash text, p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s jsonb := public.access_settings();
  v_trial int := coalesce((s ->> 'trial_days')::int, 0);
  d public.user_devices;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad device id' using errcode = '22023'; end if;
  -- Hosts that can't run a trigger on auth.users (e.g. AapStack) get the profile row here, at first sign-in.
  insert into public.profiles (id, phone, email)
    select u.id, nullif(u.phone, ''), nullif(lower(u.email), '') from auth.users u where u.id = v_uid
  on conflict (id) do update set
    phone = coalesce(public.profiles.phone, excluded.phone),
    email = coalesce(public.profiles.email, excluded.email);
  select * into d from public.user_devices where user_id = v_uid for update;
  if d.user_id is null then
    insert into public.user_devices (user_id, device_hash, device_label) values (v_uid, p_device_hash, left(p_label, 120));
    if s ->> 'mode' = 'subscription' and v_trial > 0 then
      insert into public.subscriptions (user_id, provider, status, current_start, current_end, note)
      values (v_uid, 'trial', 'trial', now(), now() + make_interval(days => v_trial), 'Free trial')
      on conflict do nothing;
    end if;
  elsif d.device_hash = p_device_hash then
    update public.user_devices set last_seen_at = now(), device_label = coalesce(left(p_label, 120), device_label) where user_id = v_uid;
  end if;
  return public.access_status(p_device_hash);
end $$;

revoke execute on function public.bind_device(text, text) from anon;
