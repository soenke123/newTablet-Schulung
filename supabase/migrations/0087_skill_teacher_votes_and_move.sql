-- ══════════════════════════════════════════════════════════════
-- Migration 0087 — MPSkills: die Lehrkraft stimmt mit · Beiträge
--                  zwischen Gruppen verschieben
-- ══════════════════════════════════════════════════════════════
-- Zwei Dinge, die im Klassenraum zusammengehören und deshalb in
-- einer Datei stehen: die Lehrkraft darf in ihrem eigenen Raum
-- zustimmen, und sie darf einen Beitrag in eine andere Frage
-- schieben.
--
-- ── 1) Zustimmen: eine Entscheidung wird zurückgenommen ────────
-- In 0080 steht an skill_room_votes: „Es stimmen nur TEILNEHMER
-- zu, nicht die Lehrkraft. Sie moderiert das Gespräch und wiegt es
-- nicht auf — und eine Stimme vom Beamer wäre in jeder Auswertung
-- eine Stimme zu viel."
--
-- Das galt für eine Auswertung, die es hier nicht gibt. Bei WordPool
-- hängt an den Stimmen keine Belohnung und keine Note, sie ordnen
-- die Wolke: was oft bestätigt wurde, steht groß in der Mitte. Wer
-- vorne steht und mitdiskutiert, hat dazu eine Meinung wie alle
-- anderen — und ein Beitrag, den die Lehrkraft ausdrücklich
-- bestätigt, ist im Gespräch nützlicher als einer, den sie nur
-- vorliest. Es bleibt EINE Stimme unter vielen.
--
-- Umgesetzt wie in skill_room_entries (0080): zwei Verfasser-Arten,
-- genau eine je Zeile. Dieselbe Form für dieselbe Frage — der
-- Beitrag hat sie schon beantwortet, die Stimme beantwortet sie
-- jetzt genauso. Der Preis ist ein echter Schema-Umbau (der
-- Primärschlüssel kann nicht bleiben, wenn participant_id nullbar
-- wird); der Gewinn ist, dass JEDE Zählung im System — heute
-- skill_entries_json und skill_sig_of, morgen was auch immer —
-- unverändert richtig bleibt. Eine zweite Tabelle
-- „skill_room_teacher_votes" hätte an drei Stellen ein `+ (select
-- count …)` verlangt, und die vierte Stelle hätte es irgendwann
-- vergessen.
--
-- ⚠️ Das `drop constraint` unten ist KEINE Idempotenz-Krücke (dafür
-- gilt weiter: DO-Block + pg_catalog-Check, siehe
-- feedback_supabase_no_drop_statements), sondern der Umbau selbst.
-- Es fällt kein Datensatz weg: derselbe Schutz steht danach als
-- partieller Unique-Index wieder da, einer je Verfasser-Art.
--
-- ── 2) Verschieben: die Frage gehört dem Zettel, aber nicht für
--       immer ───────────────────────────────────────────────────
-- 0086 sagt zu skill_entry_upsert: beim Bearbeiten wird die Gruppe
-- aus dem bestehenden Beitrag übernommen und die mitgeschickte
-- verworfen. Das gilt weiter und ist richtig — sonst schöbe sich
-- jemand am Kontingent der Zielfrage vorbei.
--
-- Was fehlte, ist der Fall, für den es das Sortieren gibt: ein
-- Zettel steht in der falschen Frage. Nicht aus Böswilligkeit,
-- sondern weil jemand zwei Fächer weiter getippt hat oder weil die
-- Antwort woanders besser passt. Ihn zu löschen und neu schreiben
-- zu lassen heißt, seine Zustimmungen wegzuwerfen — und genau die
-- sind das, was der Kurs daran getan hat.
--
-- Also: die LEHRKRAFT verschiebt, nicht der Verfasser. Es ist eine
-- Moderationshandlung wie das Ausblenden und steht neben ihm.
-- Angefasst wird allein payload[group_field]; Stimmen, Verfasser,
-- Text und Alter bleiben, wo sie sind.
--
-- Generisch wie alles in dieser Schicht: welcher payload-Schlüssel
-- die Gruppe trägt und welche es gibt, steht in skill_tools.limits
-- (0086, group_field/group_setting). Ein zweites Werkzeug mit
-- Fächern erbt das Verschieben, ohne dass hier etwas dazukommt.
--
-- KEINE Kontingentprüfung beim Ziel — bewusst. Das Kontingent
-- begrenzt, wie viel jemand SCHREIBT, nicht, wie die Lehrkraft
-- sortiert. Ein „geht nicht, die Schülerin hat dort schon fünf"
-- wäre eine Absage an die Lehrkraft für eine Regel, die einer
-- dritten Person gilt und die sie gerade gar nicht bricht.
--
-- Kein DROP ohne Not — Idempotenz per DO-Block + pg_catalog-Check.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) skill_room_votes bekommt eine zweite Verfasser-Art
-- ─────────────────────────────────────────────────────────────
alter table skill_room_votes
  add column if not exists author_id uuid references profiles(id) on delete cascade;

alter table skill_room_votes
  alter column participant_id drop not null;

-- Der Primärschlüssel (entry_id, participant_id) hat „genau eine
-- Stimme je Gerät und Beitrag" erledigt. Mit zwei Verfasser-Arten
-- kann er das nicht mehr — er ließe für die Lehrkraft beliebig
-- viele Zeilen mit participant_id = null zu. Zwei partielle
-- Unique-Indexe leisten dasselbe, je einer für eine Art.
--
-- An seine Stelle tritt ein Ersatzschlüssel. Nicht wegen der Regel
-- (die tragen die beiden Indexe), sondern weil eine Tabelle ohne
-- Primärschlüssel ihre Replica Identity verliert — das fällt erst
-- auf, wenn jemand sie Jahre später in eine Publikation aufnimmt
-- und Löschungen scheitern. Dieselbe Form wie skill_room_entries.
alter table skill_room_votes
  add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'skill_room_votes_pkey'
       and conrelid = 'skill_room_votes'::regclass
       and conkey <> array[(select attnum from pg_attribute
                             where attrelid = 'skill_room_votes'::regclass
                               and attname = 'id')]
  ) then
    alter table skill_room_votes drop constraint skill_room_votes_pkey;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'skill_room_votes_pkey'
       and conrelid = 'skill_room_votes'::regclass
  ) then
    alter table skill_room_votes add primary key (id);
  end if;
end $$;

create unique index if not exists skill_room_votes_participant_uq
  on skill_room_votes(entry_id, participant_id)
  where participant_id is not null;

create unique index if not exists skill_room_votes_author_uq
  on skill_room_votes(entry_id, author_id)
  where author_id is not null;

-- ⚠️ Der alte Primärschlüssel war zugleich der Index für „alle
-- Stimmen zu diesem Beitrag" — genau die Abfrage, die
-- skill_entries_json je Karte und skill_sig_of bei jedem Poll
-- stellt. Die beiden Unique-Indexe oben können ihn nicht ersetzen:
-- sie sind partiell, und der Planer benutzt sie nur, wo er die
-- Bedingung nachweisen kann. Also einer, der immer gilt.
create index if not exists skill_room_votes_entry_idx
  on skill_room_votes(entry_id);

-- Dieselbe Klammer wie an skill_room_entries: beides null wäre eine
-- herrenlose Stimme, beides gesetzt eine widersprüchliche.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'skill_room_votes_one_voter'
       and conrelid = 'skill_room_votes'::regclass
  ) then
    alter table skill_room_votes
      add constraint skill_room_votes_one_voter check (
        (participant_id is not null and author_id is null) or
        (participant_id is null     and author_id is not null)
      );
  end if;
end $$;

create index if not exists skill_room_votes_author_idx
  on skill_room_votes(author_id);

comment on table skill_room_votes is
  'Zustimmung zu einem Beitrag. Zwei Verfasser-Arten wie bei skill_room_entries: ein Gerät '
  'im Raum (participant_id) oder die Lehrkraft in ihrem eigenen Raum (author_id). Genau eine '
  'davon je Zeile, und je Verfasser höchstens eine Stimme je Beitrag.';


-- ─────────────────────────────────────────────────────────────
-- 2) skill_entries_json — p_me ist jetzt „wer zusieht"
-- ─────────────────────────────────────────────────────────────
-- Unverändert aus 0084 bis auf die Bedeutung eines Parameters: p_me
-- war die Teilnehmer-ID des zusehenden Geräts, jetzt ist es die ID
-- des Zusehenden — auf dem Tablet ein skill_participants.id, am
-- Beamer die profiles.id der Lehrkraft. Beide Räume sind uuid und
-- kollidieren nicht.
--
-- Warum nicht ein zusätzlicher Parameter: `create or replace` mit
-- einem vierten Argument legt eine ZWEITE Funktion daneben, und ein
-- Aufruf mit drei Argumenten wäre zwischen beiden nicht mehr
-- entscheidbar (Lehre aus 0063). Ein Parameter, der schon genau das
-- bedeutet, was er jetzt bedeuten soll, ist der bessere Weg.
--
-- Folge am Beamer: is_mine ist für die Karten der Lehrkraft wahr.
-- Das ist richtig — sie gehören ihr, sie darf sie löschen, und
-- zustimmen darf sie ihnen aus demselben Grund nicht wie alle
-- anderen ihren eigenen.
create or replace function skill_entries_json(
  p_room uuid,
  p_me   uuid    default null,
  p_all  boolean default false
)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(x order by x_created), '[]'::jsonb)
    from (
      select e.created_at as x_created,
             jsonb_build_object(
               'id',        e.id,
               'kind',      e.kind,
               'payload',   e.payload,
               'hidden',    e.hidden,
               'by_teacher',(e.author_id is not null),
               'author',    case
                              when e.author_id is not null
                                then coalesce(pr.display_name, pr.account_name, 'Lehrkraft')
                              else skill_seat_name(pa.name, pa.seat)
                            end,
               'is_mine',   (p_me is not null
                             and (e.participant_id = p_me or e.author_id = p_me)),
               'votes',     (select count(*) from skill_room_votes v where v.entry_id = e.id),
               'voted',     (p_me is not null and exists (
                               select 1 from skill_room_votes v
                                where v.entry_id = e.id
                                  and (v.participant_id = p_me or v.author_id = p_me))),
               'created_at', e.created_at,
               'updated_at', e.updated_at
             ) as x
        from skill_room_entries e
        left join skill_participants pa on pa.id = e.participant_id
        left join profiles          pr on pr.id = e.author_id
       where e.room_id = p_room
         and (p_all or not e.hidden)
    ) t;
$$;

revoke all on function skill_entries_json(uuid, uuid, boolean) from public;

comment on function skill_entries_json(uuid, uuid, boolean) is
  'Beiträge eines Raums, ohne Teilnehmer-IDs. p_me ist, wer zusieht — auf dem Tablet ein '
  'skill_participants.id, am Beamer die profiles.id der Lehrkraft; daraus kommen is_mine '
  'und voted. Ausgeblendete kommen nur mit p_all mit.';


-- ─────────────────────────────────────────────────────────────
-- 3) skill_room_get — die Lehrkraft sieht ihre eigene Stimme
-- ─────────────────────────────────────────────────────────────
-- Unverändert aus 0080 bis auf ein Argument: p_me ist nicht mehr
-- null, sondern die Lehrkraft. Ohne das wäre ihre Zustimmung nach
-- dem nächsten Poll wieder unsichtbar — der Zähler stimmte, aber
-- der Knopf böte erneut „Sehe ich auch so" an, und der zweite Druck
-- nähme sie unbemerkt zurück.
create or replace function skill_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  -- Fremder Raum und nicht existierender Raum bekommen dieselbe
  -- Antwort: sonst wäre diese Funktion ein Code-Orakel für jeden
  -- angemeldeten Account.
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);

  return jsonb_build_object(
    'ok',      true,
    'room',    skill_room_json(v_room.id) || jsonb_build_object(
                 'last_active_at', v_room.last_active_at,
                 'expired',        (v_room.expires_at <= now())
               ),
    'people',  skill_people_json(v_room.id, null),
    'state',   skill_state_json(v_room.id),
    'entries', skill_entries_json(v_room.id, v_user, true),
    'limits',  skill_limits(v_room.id),
    'role',    'presenter',
    'is_owner', true
  );
end;
$$;

revoke all on function skill_room_get(text) from public;
grant execute on function skill_room_get(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Lehrkraft: zustimmen (Umschalter)
-- ─────────────────────────────────────────────────────────────
-- Das Gegenstück zu skill_vote_toggle, mit dem Code statt dem Token
-- — dieselbe Trennung wie zwischen skill_entry_upsert und
-- skill_room_entry_add.
--
-- Zwei Regeln übernommen, weil sie nichts mit der Rolle zu tun
-- haben: zustimmen geht in JEDER Phase (das Einfrieren gilt dem
-- Inhalt, nicht dem Gespräch), und dem eigenen Beitrag stimmt man
-- nicht zu, solange das Werkzeug self_vote nicht ausdrücklich
-- erlaubt.
--
-- Eine Regel gilt hier NICHT: ausgeblendete Beiträge sind für die
-- Lehrkraft erreichbar, sie sieht sie ja. Ein Knopf, der auf einer
-- sichtbaren Karte „nicht gefunden" antwortet, wäre die
-- schlechtere Auskunft als eine Stimme, die erst zählt, wenn die
-- Karte wieder eingeblendet ist.
create or replace function skill_room_vote_toggle(p_code text, p_entry uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_lim   jsonb;
  v_entry skill_room_entries;
  v_n     int;
  v_on    boolean;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim := skill_limits(v_room.id);
  if coalesce((v_lim->>'votes')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'error', 'votes_disabled');
  end if;

  select * into v_entry from skill_room_entries
   where id = p_entry and room_id = v_room.id;
  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_entry.author_id = v_user
     and coalesce((v_lim->>'self_vote')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'own_entry');
  end if;

  delete from skill_room_votes
   where entry_id = v_entry.id and author_id = v_user;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    insert into skill_room_votes (entry_id, author_id)
    values (v_entry.id, v_user);
    v_on := true;
  else
    v_on := false;
  end if;

  -- skill_touch, damit die Signatur der Tablets weiterspringt: die
  -- Stimmenzahl steckt zwar selbst in skill_sig_of, aber der Raum
  -- soll durch eine Handlung der Lehrkraft auch nicht ablaufen.
  perform skill_touch(v_room.id);

  return jsonb_build_object(
    'ok', true, 'voted', v_on,
    'votes', (select count(*) from skill_room_votes where entry_id = v_entry.id)
  );
end;
$$;

revoke all on function skill_room_vote_toggle(text, uuid) from public;
grant execute on function skill_room_vote_toggle(text, uuid) to authenticated;

comment on function skill_room_vote_toggle(text, uuid) is
  'Zustimmung der Lehrkraft in ihrem eigenen Raum, als Umschalter. Eine Stimme unter '
  'vielen — sie zählt wie jede andere und ersetzt keine.';


-- ─────────────────────────────────────────────────────────────
-- 5) Lehrkraft: einen Beitrag in eine andere Gruppe schieben
-- ─────────────────────────────────────────────────────────────
-- Angefasst wird genau ein Schlüssel im payload. Was daran hängt —
-- Stimmen, Verfasser, Text, Alter — bleibt unberührt; die Stimmen
-- stehen in einer eigenen Tabelle und wissen von Fragen nichts.
--
-- In JEDER Phase: Sortieren ist Moderation wie das Ausblenden, und
-- gebraucht wird es gerade dann, wenn schon besprochen wird.
create or replace function skill_room_entry_move(
  p_code  text,
  p_id    uuid,
  p_group text
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_lim   jsonb;
  v_gfld  text;
  v_ids   text[];
  v_grp   text := nullif(btrim(coalesce(p_group, '')), '');
  v_entry skill_room_entries;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim  := skill_limits(v_room.id);
  v_gfld := nullif(v_lim->>'group_field', '');
  -- Ein Werkzeug ohne Gruppen hat nichts, wohin verschoben werden
  -- könnte. Kann nur passieren, wenn ein Werkzeug den Knopf anbietet,
  -- ohne Gruppen angemeldet zu haben.
  if v_gfld is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  v_ids := skill_group_ids(v_room.settings, v_lim);
  if v_grp is null or v_ids is null or not (v_grp = any(v_ids)) then
    return jsonb_build_object('ok', false, 'error', 'group_unknown');
  end if;

  select * into v_entry from skill_room_entries
   where id = p_id and room_id = v_room.id;
  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Schon dort? Dann ist nichts zu tun — und updated_at soll nicht
  -- ohne Grund springen, das zöge jedes Tablet in ein neues Zeichnen.
  if v_entry.payload->>v_gfld is not distinct from v_grp then
    return jsonb_build_object('ok', true, 'moved', false, 'group', v_grp);
  end if;

  update skill_room_entries
     set payload    = jsonb_set(payload, array[v_gfld], to_jsonb(v_grp)),
         updated_at = now()
   where id = v_entry.id;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'moved', true, 'group', v_grp);
end;
$$;

revoke all on function skill_room_entry_move(text, uuid, text) from public;
grant execute on function skill_room_entry_move(text, uuid, text) to authenticated;

comment on function skill_room_entry_move(text, uuid, text) is
  'Moderation: einen Beitrag in eine andere Gruppe (bei WordPool: Frage) schieben. Nur die '
  'Lehrkraft, in jeder Phase, ohne Kontingentprüfung am Ziel — das Kontingent begrenzt, was '
  'jemand schreibt, nicht, wie sortiert wird. Zustimmungen bleiben am Beitrag.';
