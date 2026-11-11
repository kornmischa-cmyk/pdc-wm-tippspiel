-- =====================================================================
-- WM-Tippspiel · Supabase-Schema
-- Einmal komplett im Supabase SQL Editor ausführen.
--
-- Sicherheitsmodell:
--   * Es gibt keinen Supabase-Login. Die App nutzt nur den öffentlichen
--     anon key. Deshalb sind alle Tabellen per RLS dicht.
--   * Lesbar sind direkt nur `rounds` und `matches`.
--   * Alles andere läuft über Funktionen (RPC), die Name + PIN prüfen.
--   * Fremde Tipps gibt es erst ab Anpfiff (starts_at <= now()).
--   * Nach 8 falschen PINs ist ein Profil 15 Minuten gesperrt.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.rounds (
  id         int primary key,                 -- 1 = 1. Runde … 7 = Finale
  name       text not null,
  best_of    int  not null check (best_of > 0 and best_of % 2 = 1),
  multiplier int  not null default 1 check (multiplier > 0)
);

-- Best-of-Werte wie bei der WM 2025/26. Vor Turnierstart prüfen und bei
-- Bedarf im Table Editor anpassen. Multiplikator 2 ab Viertelfinale.
insert into public.rounds (id, name, best_of, multiplier) values
  (1, '1. Runde',      5, 1),
  (2, '2. Runde',      5, 1),
  (3, '3. Runde',      7, 1),
  (4, 'Achtelfinale',  7, 1),
  (5, 'Viertelfinale', 9, 2),
  (6, 'Halbfinale',   11, 2),
  (7, 'Finale',       13, 2)
on conflict (id) do nothing;

create table if not exists public.matches (
  id        bigint generated always as identity primary key,
  round_id  int  not null references public.rounds(id),
  pos       int  not null check (pos > 0),    -- Position im Turnierbaum der Runde
  player1   text,
  player2   text,
  starts_at timestamptz,
  sets1     int check (sets1 >= 0),
  sets2     int check (sets2 >= 0),
  unique (round_id, pos)
);

create table if not exists public.players (
  id              bigint generated always as identity primary key,
  name            text not null,
  pin_hash        text not null,
  is_admin        boolean not null default false,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists players_name_ci on public.players (lower(name));

create table if not exists public.tips (
  player_id  bigint not null references public.players(id) on delete cascade,
  match_id   bigint not null references public.matches(id) on delete cascade,
  pick       smallint not null check (pick in (1, 2)),   -- 1 = player1, 2 = player2
  loser_sets smallint check (loser_sets >= 0),           -- optional: exakter Tipp
  updated_at timestamptz not null default now(),
  primary key (player_id, match_id)
);

-- ---------------------------------------------------------------------
-- Zugriffsschutz
-- ---------------------------------------------------------------------

alter table public.rounds  enable row level security;
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.tips    enable row level security;

revoke all on public.rounds, public.matches, public.players, public.tips from anon, authenticated;
grant select on public.rounds, public.matches to anon, authenticated;

drop policy if exists rounds_read  on public.rounds;
drop policy if exists matches_read on public.matches;
create policy rounds_read  on public.rounds  for select using (true);
create policy matches_read on public.matches for select using (true);
-- players und tips: keine Policy → kein direkter Zugriff.

-- ---------------------------------------------------------------------
-- Interne Helfer
-- ---------------------------------------------------------------------

-- Prüft die PIN und führt den Sperrzähler. Liefert 'ok' | 'wrong' | 'locked' | 'unknown'.
create or replace function public._auth(p_player bigint, p_pin text)
returns text language plpgsql security definer
set search_path = public, extensions as $$
declare r public.players;
begin
  select * into r from public.players where id = p_player for update;
  if not found then return 'unknown'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;

  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.players set failed_attempts = 0, locked_until = null where id = p_player;
    return 'ok';
  end if;

  update public.players set
    locked_until    = case when failed_attempts + 1 >= 8 then now() + interval '15 minutes' else null end,
    failed_attempts = case when failed_attempts + 1 >= 8 then 0 else failed_attempts + 1 end
  where id = p_player;
  return 'wrong';
end $$;

create or replace function public._auth_admin(p_player bigint, p_pin text)
returns text language plpgsql security definer
set search_path = public, extensions as $$
declare s text;
begin
  s := public._auth(p_player, p_pin);
  if s <> 'ok' then return s; end if;
  if not exists (select 1 from public.players where id = p_player and is_admin) then
    return 'not_admin';
  end if;
  return 'ok';
end $$;

-- Alle Tipps mit Punkten (nur für fertige Matches > 0). Grundlage für
-- Rangliste und Ergebnisansicht, damit die Punkte nur an einer Stelle
-- berechnet werden.
create or replace function public._scored_tips()
returns table (
  player_id bigint, match_id bigint, pick smallint, loser_sets smallint,
  finished boolean, hit boolean, exact boolean, points int
) language sql stable security definer
set search_path = public as $$
  select t.player_id, t.match_id, t.pick, t.loser_sets,
         f.winner is not null                                  as finished,
         coalesce(t.pick = f.winner, false)                    as hit,
         coalesce(t.pick = f.winner and t.loser_sets = f.loser_sets, false) as exact,
         case when t.pick = f.winner
              then f.multiplier * (1 + case when t.loser_sets = f.loser_sets then 2 else 0 end)
              else 0 end                                       as points
  from public.tips t
  join (
    select m.id, r.multiplier,
           case when m.sets1 = (r.best_of + 1) / 2 then 1
                when m.sets2 = (r.best_of + 1) / 2 then 2 end as winner,
           least(m.sets1, m.sets2)                              as loser_sets
    from public.matches m join public.rounds r on r.id = m.round_id
  ) f on f.id = t.match_id
$$;

-- Normalisiert Zeitangaben: ohne Offset gilt deutsche Zeit.
create or replace function public._to_ts(p text)
returns timestamptz language sql stable as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~ '(Z|[+-]\d{2}(:?\d{2})?)$' then p::timestamptz
    else p::timestamp at time zone 'Europe/Berlin'
  end
$$;

-- ---------------------------------------------------------------------
-- Öffentliche Funktionen (Spieler)
-- ---------------------------------------------------------------------

create or replace function public.list_players()
returns table (id bigint, name text) language sql stable security definer
set search_path = public as $$
  select id, name from public.players order by lower(name)
$$;

create or replace function public.register_player(p_name text, p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id bigint;
begin
  if length(v_name) < 2 or length(v_name) > 24 then
    return jsonb_build_object('ok', false, 'error', 'name_invalid');
  end if;
  if coalesce(p_pin, '') !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'pin_invalid');
  end if;
  if exists (select 1 from public.players where lower(name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;
  insert into public.players (name, pin_hash)
  values (v_name, crypt(p_pin, gen_salt('bf')))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'player_id', v_id, 'name', v_name, 'is_admin', false);
end $$;

create or replace function public.login(p_name text, p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare r public.players; s text;
begin
  select * into r from public.players where lower(name) = lower(btrim(coalesce(p_name, '')));
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown'); end if;
  s := public._auth(r.id, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  return jsonb_build_object('ok', true, 'player_id', r.id, 'name', r.name, 'is_admin', r.is_admin);
end $$;

create or replace function public.save_tip(
  p_player bigint, p_pin text, p_match bigint, p_pick int, p_loser_sets int default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text; m public.matches; ft int;
begin
  s := public._auth(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;

  select * into m from public.matches where id = p_match;
  if not found then return jsonb_build_object('ok', false, 'error', 'match_unknown'); end if;
  if m.player1 is null or m.player2 is null or m.starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'match_not_ready');
  end if;
  if m.starts_at <= now() or m.sets1 is not null then
    return jsonb_build_object('ok', false, 'error', 'locked_match');
  end if;

  if p_pick is null then
    delete from public.tips where player_id = p_player and match_id = p_match;
    return jsonb_build_object('ok', true, 'deleted', true);
  end if;
  if p_pick not in (1, 2) then
    return jsonb_build_object('ok', false, 'error', 'pick_invalid');
  end if;

  select (best_of + 1) / 2 into ft from public.rounds where id = m.round_id;
  if p_loser_sets is not null and (p_loser_sets < 0 or p_loser_sets >= ft) then
    return jsonb_build_object('ok', false, 'error', 'sets_invalid');
  end if;

  insert into public.tips (player_id, match_id, pick, loser_sets, updated_at)
  values (p_player, p_match, p_pick, p_loser_sets, now())
  on conflict (player_id, match_id)
  do update set pick = excluded.pick, loser_sets = excluded.loser_sets, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Eigene Tipps (auch für Spiele, die noch nicht begonnen haben).
create or replace function public.get_my_tips(p_player bigint, p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text;
begin
  s := public._auth(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  return jsonb_build_object('ok', true, 'tips', coalesce((
    select jsonb_agg(jsonb_build_object(
      'match_id', match_id, 'pick', pick, 'loser_sets', loser_sets,
      'finished', finished, 'hit', hit, 'exact', exact, 'points', points))
    from public._scored_tips() where player_id = p_player), '[]'::jsonb));
end $$;

-- Alle Tipps für Spiele, die begonnen haben. Ohne PIN abrufbar.
create or replace function public.get_public_tips()
returns table (
  match_id bigint, player_id bigint, name text, pick smallint, loser_sets smallint,
  finished boolean, hit boolean, exact boolean, points int
) language sql stable security definer
set search_path = public as $$
  select st.match_id, st.player_id, p.name, st.pick, st.loser_sets,
         st.finished, st.hit, st.exact, st.points
  from public._scored_tips() st
  join public.matches m on m.id = st.match_id
  join public.players p on p.id = st.player_id
  where m.starts_at <= now() or m.sets1 is not null
  order by st.match_id, lower(p.name)
$$;

create or replace function public.leaderboard()
returns table (player_id bigint, name text, points int, hits int, exacts int, tipped int)
language sql stable security definer
set search_path = public as $$
  select p.id, p.name,
         coalesce(sum(st.points), 0)::int,
         (count(*) filter (where st.hit))::int,
         (count(*) filter (where st.exact))::int,
         (count(st.player_id) filter (where st.finished))::int
  from public.players p
  left join public._scored_tips() st on st.player_id = p.id
  group by p.id, p.name
  order by 3 desc, 5 desc, lower(p.name)
$$;

-- ---------------------------------------------------------------------
-- Admin-Funktionen
-- ---------------------------------------------------------------------

-- Spiel anlegen oder ändern. Leere Felder bleiben unverändert.
create or replace function public.admin_save_match(
  p_player bigint, p_pin text, p_round int, p_pos int,
  p_player1 text default null, p_player2 text default null, p_starts_at text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text; v_id bigint;
begin
  s := public._auth_admin(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  if not exists (select 1 from public.rounds where id = p_round) then
    return jsonb_build_object('ok', false, 'error', 'round_unknown');
  end if;

  insert into public.matches (round_id, pos, player1, player2, starts_at)
  values (p_round, p_pos, nullif(btrim(p_player1), ''), nullif(btrim(p_player2), ''), public._to_ts(p_starts_at))
  on conflict (round_id, pos) do update set
    player1   = coalesce(excluded.player1,   public.matches.player1),
    player2   = coalesce(excluded.player2,   public.matches.player2),
    starts_at = coalesce(excluded.starts_at, public.matches.starts_at)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'match_id', v_id);
end $$;

-- Mehrere Spiele auf einmal. Format:
-- [{"round":1,"pos":1,"player1":"…","player2":"…","starts_at":"2026-12-11 20:00"}, …]
create or replace function public.admin_import(p_player bigint, p_pin text, p_matches jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text; e jsonb; n int := 0;
begin
  s := public._auth_admin(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  if jsonb_typeof(p_matches) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'import_format');
  end if;

  for e in select * from jsonb_array_elements(p_matches) loop
    if (e->>'round') is null or (e->>'pos') is null then
      raise exception 'Eintrag ohne round/pos: %', e;
    end if;
    insert into public.matches (round_id, pos, player1, player2, starts_at)
    values ((e->>'round')::int, (e->>'pos')::int,
            nullif(btrim(e->>'player1'), ''), nullif(btrim(e->>'player2'), ''),
            public._to_ts(e->>'starts_at'))
    on conflict (round_id, pos) do update set
      player1   = coalesce(excluded.player1,   public.matches.player1),
      player2   = coalesce(excluded.player2,   public.matches.player2),
      starts_at = coalesce(excluded.starts_at, public.matches.starts_at);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- Ergebnis setzen (oder mit null/null löschen). Der Sieger wird
-- automatisch in die nächste Runde geschrieben, solange dort noch
-- kein Ergebnis steht. Intern, genutzt von Admin und Bot.
create or replace function public._set_result(p_match bigint, p_sets1 int, p_sets2 int)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare m public.matches; ft int; nxt public.matches;
        v_winner text; v_next_pos int; v_slot int;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'match_unknown'); end if;
  select (best_of + 1) / 2 into ft from public.rounds where id = m.round_id;

  if p_sets1 is null and p_sets2 is null then
    v_winner := null;
  elsif p_sets1 is null or p_sets2 is null
     or p_sets1 < 0 or p_sets2 < 0
     or not ((p_sets1 = ft and p_sets2 < ft) or (p_sets2 = ft and p_sets1 < ft)) then
    return jsonb_build_object('ok', false, 'error', 'result_invalid', 'first_to', ft);
  else
    v_winner := case when p_sets1 = ft then m.player1 else m.player2 end;
  end if;

  v_next_pos := (m.pos + 1) / 2;
  v_slot     := case when m.pos % 2 = 1 then 1 else 2 end;
  select * into nxt from public.matches
   where round_id = m.round_id + 1 and pos = v_next_pos for update;

  if found and nxt.sets1 is not null then
    return jsonb_build_object('ok', false, 'error', 'next_match_played');
  end if;

  update public.matches set sets1 = p_sets1, sets2 = p_sets2 where id = p_match;

  if exists (select 1 from public.rounds where id = m.round_id + 1) then
    if nxt.id is null then
      insert into public.matches (round_id, pos) values (m.round_id + 1, v_next_pos)
      returning * into nxt;
    end if;
    if v_slot = 1 then
      update public.matches set player1 = v_winner where id = nxt.id;
    else
      update public.matches set player2 = v_winner where id = nxt.id;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_result(
  p_player bigint, p_pin text, p_match bigint, p_sets1 int, p_sets2 int)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text;
begin
  s := public._auth_admin(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  return public._set_result(p_match, p_sets1, p_sets2);
end $$;

create or replace function public.admin_delete_match(p_player bigint, p_pin text, p_match bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text;
begin
  s := public._auth_admin(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  delete from public.matches where id = p_match;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reset_pin(p_player bigint, p_pin text, p_target bigint, p_new_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text;
begin
  s := public._auth_admin(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  if coalesce(p_new_pin, '') !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'pin_invalid');
  end if;
  update public.players
     set pin_hash = crypt(p_new_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null
   where id = p_target;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.admin_delete_player(p_player bigint, p_pin text, p_target bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text;
begin
  s := public._auth_admin(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  if p_target = p_player then
    return jsonb_build_object('ok', false, 'error', 'self_delete');
  end if;
  delete from public.players where id = p_target;
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------------------
-- Automatischer Abgleich (GitHub Action → bot_sync)
-- ---------------------------------------------------------------------
-- Die GitHub Action schickt den kompletten Stand aus data/wm.json.
-- Regeln:
--   * Spiele und Anstoßzeiten werden angelegt bzw. aktualisiert.
--   * Ein Ergebnis wird nur eingetragen, wenn noch keins existiert.
--   * Ein abweichendes Ergebnis wird NIE still überschrieben, sondern als
--     Konflikt gemeldet. Ausnahme: "force": true im Eintrag.
--   * Jede Änderung landet im Protokoll (bot_log), sichtbar im Admin-Bereich.

create table if not exists public.bot_config (
  id         int primary key default 1 check (id = 1),
  token_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bot_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  kind   text not null,          -- neu | update | ergebnis | korrektur | konflikt | fehler
  label  text not null,
  detail text
);

alter table public.bot_config enable row level security;
alter table public.bot_log    enable row level security;
revoke all on public.bot_config, public.bot_log from anon, authenticated;

-- Einmal im SQL Editor ausführen: select public.create_bot_token();
-- Das Ergebnis als GitHub-Secret BOT_TOKEN hinterlegen. Erneut ausführen
-- erzeugt ein neues Token, das alte wird ungültig.
create or replace function public.create_bot_token()
returns text language plpgsql security definer
set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  insert into public.bot_config (id, token_hash) values (1, crypt(t, gen_salt('bf')))
  on conflict (id) do update set token_hash = excluded.token_hash, created_at = now();
  return t;
end $$;

create or replace function public._match_label(p_round int, p_pos int, p1 text, p2 text)
returns text language sql stable security definer
set search_path = public as $$
  select coalesce((select name from public.rounds where id = p_round), 'Runde ' || p_round)
         || ' #' || p_pos || ': ' || coalesce(p1, '?') || ' – ' || coalesce(p2, '?')
$$;

create or replace function public.bot_sync(p_token text, p_data jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  arr jsonb; e jsonb; m public.matches; r jsonb; rd jsonb; v_bo int; old_bo int;
  v_round int; v_pos int; v_p1 text; v_p2 text; v_ts timestamptz; s1 int; s2 int;
  v_label text; v_changes text[];
  n_new int := 0; n_upd int := 0; n_res int := 0;
  conflicts jsonb := '[]'; errors jsonb := '[]';
begin
  if not exists (select 1 from public.bot_config where token_hash = crypt(coalesce(p_token, ''), token_hash)) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- Optional: Best-of pro Runde, nur solange in der Runde noch kein Ergebnis steht.
  if jsonb_typeof(p_data->'rounds') = 'array' then
    for rd in select value from jsonb_array_elements(p_data->'rounds') loop
      begin
        v_bo := (rd->>'best_of')::int;
        select best_of into old_bo from public.rounds where id = (rd->>'id')::int;
        if found and v_bo is not null and v_bo <> old_bo then
          if v_bo <= 0 or v_bo % 2 = 0 then
            errors := errors || jsonb_build_object('round', rd, 'error', 'best_of muss ungerade sein');
          elsif exists (select 1 from public.matches where round_id = (rd->>'id')::int and sets1 is not null) then
            conflicts := conflicts || jsonb_build_object('round', rd->>'id', 'db', old_bo, 'file', v_bo);
            insert into public.bot_log (kind, label, detail)
            values ('konflikt', 'Runde ' || (rd->>'id'), 'Best of ' || old_bo || ' → ' || v_bo || ' abgelehnt, Runde läuft schon');
          else
            update public.rounds set best_of = v_bo where id = (rd->>'id')::int;
            insert into public.bot_log (kind, label, detail)
            values ('update', (select name from public.rounds where id = (rd->>'id')::int), 'Best of ' || old_bo || ' → ' || v_bo);
          end if;
        end if;
      exception when others then
        errors := errors || jsonb_build_object('round', rd, 'error', sqlerrm);
      end;
    end loop;
  end if;

  arr := case when jsonb_typeof(p_data) = 'array' then p_data else p_data->'matches' end;
  if arr is null or jsonb_typeof(arr) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'import_format');
  end if;

  for e in
    select value from jsonb_array_elements(arr)
    order by case when value->>'round' ~ '^\d+$' then (value->>'round')::int else 999 end,
             case when value->>'pos'   ~ '^\d+$' then (value->>'pos')::int   else 999 end
  loop
    begin
      v_round := (e->>'round')::int;
      v_pos   := (e->>'pos')::int;
      if v_round is null or v_pos is null or not exists (select 1 from public.rounds where id = v_round) then
        raise exception 'round/pos fehlt oder ungültig';
      end if;
      v_p1 := nullif(btrim(e->>'player1'), '');
      v_p2 := nullif(btrim(e->>'player2'), '');
      v_ts := public._to_ts(e->>'starts_at');

      select * into m from public.matches where round_id = v_round and pos = v_pos for update;

      if not found then
        insert into public.matches (round_id, pos, player1, player2, starts_at)
        values (v_round, v_pos, v_p1, v_p2, v_ts) returning * into m;
        n_new := n_new + 1;
        insert into public.bot_log (kind, label) values ('neu', public._match_label(v_round, v_pos, m.player1, m.player2));
      else
        v_changes := array[]::text[];
        if v_p1 is not null and v_p1 is distinct from m.player1 then v_changes := v_changes || ('Spieler 1: ' || coalesce(m.player1, '–') || ' → ' || v_p1); end if;
        if v_p2 is not null and v_p2 is distinct from m.player2 then v_changes := v_changes || ('Spieler 2: ' || coalesce(m.player2, '–') || ' → ' || v_p2); end if;
        if v_ts is not null and v_ts is distinct from m.starts_at then
          v_changes := v_changes || ('Anstoß: ' || coalesce(to_char(m.starts_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI'), '–')
                                     || ' → ' || to_char(v_ts at time zone 'Europe/Berlin', 'DD.MM. HH24:MI'));
        end if;
        if cardinality(v_changes) > 0 then
          update public.matches set
            player1   = coalesce(v_p1, player1),
            player2   = coalesce(v_p2, player2),
            starts_at = coalesce(v_ts, starts_at)
          where id = m.id returning * into m;
          n_upd := n_upd + 1;
          insert into public.bot_log (kind, label, detail)
          values ('update', public._match_label(v_round, v_pos, m.player1, m.player2), array_to_string(v_changes, '; '));
        end if;
      end if;

      v_label := public._match_label(v_round, v_pos, m.player1, m.player2);

      if (e->>'sets1') is not null and (e->>'sets2') is not null then
        s1 := (e->>'sets1')::int; s2 := (e->>'sets2')::int;
        if m.sets1 is null then
          r := public._set_result(m.id, s1, s2);
          if (r->>'ok')::boolean then
            n_res := n_res + 1;
            insert into public.bot_log (kind, label, detail) values ('ergebnis', v_label, s1 || ':' || s2);
          else
            errors := errors || jsonb_build_object('match', v_label, 'error', r->>'error');
            insert into public.bot_log (kind, label, detail) values ('fehler', v_label, (r->>'error') || ' bei ' || s1 || ':' || s2);
          end if;
        elsif m.sets1 is distinct from s1 or m.sets2 is distinct from s2 then
          if coalesce((e->>'force')::boolean, false) then
            r := public._set_result(m.id, s1, s2);
            if (r->>'ok')::boolean then
              n_res := n_res + 1;
              insert into public.bot_log (kind, label, detail)
              values ('korrektur', v_label, m.sets1 || ':' || m.sets2 || ' → ' || s1 || ':' || s2);
            else
              errors := errors || jsonb_build_object('match', v_label, 'error', r->>'error');
              insert into public.bot_log (kind, label, detail) values ('fehler', v_label, (r->>'error') || ' bei Korrektur');
            end if;
          else
            conflicts := conflicts || jsonb_build_object('match', v_label, 'db', m.sets1 || ':' || m.sets2, 'file', s1 || ':' || s2);
            insert into public.bot_log (kind, label, detail)
            values ('konflikt', v_label, 'Datenbank ' || m.sets1 || ':' || m.sets2 || ', Datei ' || s1 || ':' || s2 || ' – nicht überschrieben');
          end if;
        end if;
      end if;

    exception when others then
      errors := errors || jsonb_build_object('entry', e, 'error', sqlerrm);
      insert into public.bot_log (kind, label, detail) values ('fehler', coalesce(e->>'round', '?') || '/' || coalesce(e->>'pos', '?'), sqlerrm);
    end;
  end loop;

  return jsonb_build_object('ok', true, 'created', n_new, 'updated', n_upd, 'results', n_res,
                            'conflicts', conflicts, 'errors', errors);
end $$;

create or replace function public.admin_bot_log(p_player bigint, p_pin text, p_limit int default 50)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare s text;
begin
  s := public._auth_admin(p_player, p_pin);
  if s <> 'ok' then return jsonb_build_object('ok', false, 'error', s); end if;
  return jsonb_build_object('ok', true, 'log', coalesce((
    select jsonb_agg(x order by x.id desc) from (
      select id, at, kind, label, detail from public.bot_log order by id desc limit least(coalesce(p_limit, 50), 500)
    ) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.list_players(),
  public.register_player(text, text),
  public.login(text, text),
  public.save_tip(bigint, text, bigint, int, int),
  public.get_my_tips(bigint, text),
  public.get_public_tips(),
  public.leaderboard(),
  public.admin_save_match(bigint, text, int, int, text, text, text),
  public.admin_import(bigint, text, jsonb),
  public.admin_set_result(bigint, text, bigint, int, int),
  public.admin_delete_match(bigint, text, bigint),
  public.admin_reset_pin(bigint, text, bigint, text),
  public.admin_delete_player(bigint, text, bigint),
  public.admin_bot_log(bigint, text, int),
  public.bot_sync(text, jsonb)
to anon, authenticated;
-- create_bot_token() bleibt bewusst nur im SQL Editor ausführbar.

-- Nach der ersten Registrierung dich selbst zum Admin machen:
--   update public.players set is_admin = true where lower(name) = lower('DEIN NAME');
