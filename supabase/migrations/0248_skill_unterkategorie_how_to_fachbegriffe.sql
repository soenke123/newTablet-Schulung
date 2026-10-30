-- ══════════════════════════════════════════════════════════════
-- Migration 0248 — Unterkategorien im Sortiment, „How to Fachbegriffe"
-- ══════════════════════════════════════════════════════════════
-- Sönke 30.10.2026:
--   „wir nennen es ‚How to Fachbegriffe‘ und KistenSturm soll
--    Kistenturm heißen. Und ich will die Skills einmal mit einer
--    Unterkategorie versehen (bei Informatik soll es die Unterkategorie
--    ‚Künstliche Intelligenz‘ geben). Und wenn ich einen Skill erstellen
--    will, soll das Dropdown auch in den Kategorien geordnet sein.“
--
-- ── Unterkategorie ────────────────────────────────────────────
-- Wie subject (0089) eine Beschriftung und keine Entität: Freitext,
-- leer = keine Unterkategorie. Auf der Landing stehen im Fach erst die
-- Skills ohne Unterkategorie, dann je Unterkategorie eine kleine
-- Überschrift; die Reihenfolge der Unterkategorien folgt wieder dem
-- kleinsten sort_order darin. Im Dropdown für neue Räume wird daraus
-- eine Gruppe „Informatik · Künstliche Intelligenz".
--
-- Künstliche Intelligenz: NeuroLab (Neuron), Tiny LM (Sprachmodell),
-- Reinforce Yourself (Reinforcement Learning), Wild Clusters
-- (Clustering = maschinelles Lernen).
--
-- ── skill_rooms_list ──────────────────────────────────────────
-- Das Dropdown auf lehrer.html?new liest die Skills aus dieser
-- Funktion, nicht aus der Tabelle. Sie liefert jetzt zusätzlich
-- subject, subcategory und sort_order — sonst unverändert gegenüber
-- 0205. create or replace behält die Rechte (0225).
--
-- ── Umbenennungen ─────────────────────────────────────────────
-- Nur der angezeigte Name: id 'derby', Ordner DefinitionsDerby, die
-- Tabellen dd_* und die Avatar-ids mps_derby_* bleiben (stehen in
-- Räumen, Lernständen und profiles.avatar_id).
--
-- Kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════

alter table skill_tools add column if not exists subcategory text;

comment on column skill_tools.subcategory is
  'Unterkategorie innerhalb von subject, z.B. „Künstliche Intelligenz". Freitext, leer = keine. '
  'Reihenfolge der Unterkategorien folgt dem kleinsten sort_order darin (seit 0248).';

update skill_tools set subcategory = 'Künstliche Intelligenz'
 where id in ('neurolab', 'tinylm', 'reinforce', 'wildclusters');

update skill_tools set
  title = 'How to Fachbegriffe',
  blurb = 'Begriffe und Definitionen als Karten: Lehrkräfte legen Stapel an (mit Bildern, per Text oder '
          'Karte für Karte) und teilen sie mit der Klasse. Gelernt wird mit Übersicht, Karteikarten, '
          'einer Insel voller Wesen, Memory, dem Duell zu zweit – und im Kistenturm stapelt die ganze '
          'Klasse in Teams um die Wette.'
where id = 'derby';


create or replace function skill_rooms_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_rooms jsonb;
  v_tools jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  -- Vor dem Lesen, nicht danach: sonst stünden die gerade gelöschten
  -- Räume noch in der Antwort, die die Löschung ausgelöst hat.
  perform skill_cleanup_maybe();

  select coalesce(jsonb_agg(x order by x_test, x_active desc), '[]'::jsonb)
    into v_rooms
    from (
      select r.is_test as x_test, r.last_active_at as x_active,
             skill_room_json(r.id)
               || jsonb_build_object(
                    'last_active_at', r.last_active_at,
                    'expired',        (r.expires_at <= now()),
                    'people',  (select count(*) from skill_participants p where p.room_id = r.id),
                    'online',  (select count(*) from skill_participants p
                                 where p.room_id = r.id
                                   and p.last_seen_at > now() - interval '90 seconds'),
                    'blocked', (select count(*) from skill_participants p
                                 where p.room_id = r.id and p.blocked),
                    'entries', (select count(*) from skill_room_entries e where e.room_id = r.id)
                  )
               || case when r.owner_id = v_user then '{}'::jsonb
                       else jsonb_build_object(
                              'co_teacher', true,
                              'owner_name', (select coalesce(o.display_name, o.account_name)
                                               from profiles o where o.id = r.owner_id)) end as x
        from skill_rooms r
       where r.owner_id = v_user
          or exists (select 1 from skill_room_teachers t where t.room_id = r.id and t.user_id = v_user)
    ) t;

  -- subject, subcategory, sort_order seit 0248: das Dropdown für neue
  -- Räume ordnet danach (ein jsonb-Objekt hat selbst keine Reihenfolge).
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
           'title', t.title, 'icon', t.icon, 'active', t.active,
           'folder', t.folder,
           'limits', t.limits,
           'multi_room', t.multi_room,
           'max_rooms', t.max_rooms,
           'subject', t.subject,
           'subcategory', t.subcategory,
           'sort_order', t.sort_order,
           'live', (select count(*) from skill_rooms r
                     where r.owner_id = v_user and r.tool_id = t.id
                       and r.is_test = false and r.expires_at > now())
         )), '{}'::jsonb)
    into v_tools
    from skill_tools t;

  return jsonb_build_object('ok', true, 'rooms', v_rooms, 'tools', v_tools);
end;
$$;
