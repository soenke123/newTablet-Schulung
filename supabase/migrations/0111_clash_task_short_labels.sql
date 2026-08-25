-- ══════════════════════════════════════════════════════════════
-- 0111 — Kurzzeichen für die Aufgabenarten
-- ══════════════════════════════════════════════════════════════
-- In der Lobby steht neben den acht Wappen, was gleich gerechnet wird.
-- Bis eben stand dort der volle Name jeder Unterkategorie samt Modus
-- („Bruchrechnung — Addieren / Subtrahieren (tippen) · Kürzen
-- (auswählen)"). Das war eine Zeile Fließtext neben einer Reihe Bilder
-- und damit unlesbar.
--
-- Gewünscht ist die Kurzform: „Bruchrechnung + − · : kürzen". Dafür
-- braucht jede Aufgabenart ein Zeichen, das sie in zwei bis drei
-- Glyphen benennt. Das gehört in den KATALOG und nicht in den Client:
-- eine neue Kategorie soll weiterhin eine Migration kosten und kein
-- Client-Update (dieselbe Überlegung wie bei label und example in
-- 0109).
--
-- ⚠️ Eigene Migration statt einer Korrektur in 0109: 0109 ist bereits
-- eingespielt. Eine Änderung an einer gelaufenen Migration kommt in der
-- Datenbank nie an, solange niemand sie erneut ausführt (Regel:
-- feedback_stale_reference_data_do_nothing).
--
-- ⚠️ clash_task_catalog wird auf Grundlage der HÖCHSTEN bestehenden
-- Fassung (0109) neu deklariert, nicht aus einer älteren kopiert
-- (Regel: feedback_shop_state_merge_regressions).
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die Spalte
-- ─────────────────────────────────────────────────────────────
-- `add column if not exists` genügt hier: die Spalte trägt reine
-- Referenzdaten, die der Seed direkt darunter ohnehin für jede Zeile
-- setzt. Es gibt nichts, was ein zweiter Lauf überschreiben könnte —
-- anders als bei clash_boards.pool (0109), wo die Wahl einer Lehrkraft
-- drinsteht und deshalb ein DO-Block nötig war.
alter table clash_task_types
  add column if not exists short_label text;

comment on column clash_task_types.short_label is
  'Kurzzeichen für die Lobby-Zeile („+ −", „kürzen"). Zwei bis drei Glyphen, die neben den '
  'Wappen noch lesbar sind — der volle Name steht in der Auswahl-Tabelle. Fehlt es, behilft '
  'sich der Client mit dem ersten Teil von label.';


-- ─────────────────────────────────────────────────────────────
-- 2) Die Zeichen
-- ─────────────────────────────────────────────────────────────
-- Kein `insert … on conflict`, sondern gezielte Updates: die fünf
-- Zeilen stehen seit 0109 in der Datenbank, und ein zweiter vollständiger
-- Seed müsste jede andere Spalte mitschleppen und bei jeder späteren
-- Änderung nachgezogen werden.
--
-- „−" ist das Minuszeichen (U+2212), nicht der Bindestrich: neben dem
-- „+" soll es auf gleicher Höhe und gleicher Länge stehen.
update clash_task_types set short_label = '+'       where key = 'add100';
update clash_task_types set short_label = '+ −'     where key = 'frac_addsub';
update clash_task_types set short_label = '· :'     where key = 'frac_muldiv';
update clash_task_types set short_label = 'kürzen'  where key = 'frac_reduce';
update clash_task_types set short_label = '< >'     where key = 'frac_compare';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_task_catalog — Neu-Deklaration auf Basis 0109:263
-- ─────────────────────────────────────────────────────────────
-- Wort für Wort die Fassung aus 0109, ergänzt um ein Feld je
-- Unterkategorie: 'short'. Der Client nimmt es für die Lobby-Zeile und
-- fällt auf den Namen zurück, wenn es fehlt.
create or replace function clash_task_catalog(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'groups', coalesce((
      select jsonb_agg(x.g order by x.g_sort, x.g_key)
        from (
          select t.group_key as g_key,
                 min(t.sort_group) as g_sort,
                 jsonb_build_object(
                   'key',   t.group_key,
                   'label', min(t.group_label),
                   'items', jsonb_agg(
                     jsonb_build_object(
                       'key',     t.key,
                       'label',   t.label,
                       'short',   t.short_label,
                       'example', t.example,
                       'free',    t.allows_free,
                       'mc',      t.allows_mc,
                       'choices', t.choice_count
                     ) order by t.sort_item, t.key)
                 ) as g
            from clash_task_types t
           group by t.group_key
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function clash_task_catalog(text) from public;
grant execute on function clash_task_catalog(text) to authenticated;

comment on function clash_task_catalog(text) is
  'Der Aufgaben-Katalog für die Auswahl-Tabelle in der Lobby, fertig gruppiert und sortiert. '
  'Seit 0111 mit „short" je Unterkategorie — dem Kurzzeichen für die Lobby-Zeile. '
  'Statisch — einmal beim Öffnen der Auswahl holen, nicht im Poll-Takt. p_code ist nur die '
  'Zugangsprüfung (die Beamer-Schicht hängt ihn ohnehin an jede RPC).';
