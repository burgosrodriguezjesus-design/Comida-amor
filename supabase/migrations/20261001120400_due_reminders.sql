-- Recordatorios que tocan ahora: cada uno se reclama una sola vez al día y se omite
-- si la persona ha registrado algo hace poco (para no molestar).
create function public.due_reminders(p_now timestamptz default now())
returns table (user_id uuid, reminder_id text, local_date text, skip boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r record;
  t jsonb;
  local_ts timestamp;
  minutes_now int;
  minutes_rem int;
  last_created timestamptz;
  last_eaten text;
  claimed int;
  is_quiet boolean;
begin
  for r in
    select rs.user_id, rs.quiet_minutes, rs.times, p.timezone
    from public.reminder_settings rs
    join public.profiles p on p.id = rs.user_id
    where rs.enabled and exists (select 1 from public.push_subscriptions s where s.user_id = rs.user_id)
  loop
    begin
      local_ts := p_now at time zone r.timezone;
    exception when others then
      local_ts := p_now at time zone 'Europe/Madrid';
    end;
    minutes_now := extract(hour from local_ts)::int * 60 + extract(minute from local_ts)::int;
    for t in select * from jsonb_array_elements(r.times) loop
      continue when not coalesce((t ->> 'enabled')::boolean, false);
      minutes_rem := split_part(t ->> 'time', ':', 1)::int * 60 + split_part(t ->> 'time', ':', 2)::int;
      continue when minutes_now - minutes_rem < 0 or minutes_now - minutes_rem > 15;
      insert into public.reminder_log (user_id, reminder_id, local_date, status)
      values (r.user_id, t ->> 'id', to_char(local_ts, 'YYYY-MM-DD'), 'pending')
      on conflict do nothing;
      get diagnostics claimed = row_count;
      continue when claimed = 0;
      select max(e.created_at), max(e.eaten_at) into last_created, last_eaten from public.entries e where e.user_id = r.user_id;
      is_quiet := r.quiet_minutes > 0 and (
        (last_created is not null and p_now - last_created <= make_interval(mins => r.quiet_minutes))
        or (last_eaten is not null and left(last_eaten, 10) = to_char(local_ts, 'YYYY-MM-DD')
            and minutes_now - (substr(last_eaten, 12, 2)::int * 60 + substr(last_eaten, 15, 2)::int) between 0 and r.quiet_minutes)
      );
      user_id := r.user_id;
      reminder_id := t ->> 'id';
      local_date := to_char(local_ts, 'YYYY-MM-DD');
      skip := is_quiet;
      return next;
    end loop;
  end loop;
end;
$$;
revoke all on function public.due_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.due_reminders(timestamptz) to service_role;
