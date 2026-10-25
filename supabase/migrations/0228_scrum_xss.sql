-- ══════════════════════════════════════════════════════════════
-- Migration 0228 — Scrum Werkstatt: kein HTML/Skript über Goal und Bilder
-- ══════════════════════════════════════════════════════════════
-- Fund (Sicherheitsprüfung 24.10.2026): Das Product Goal ist HTML aus
-- dem Editor und wurde in der Werkstatt roh per innerHTML gezeigt;
-- Avatar und Bilder standen unmaskiert in src="…". Wer seinen
-- Teilnehmer-Token hat, kann scrum_save direkt rufen und so Skript
-- bei Team und Lehrkraft laufen lassen (gleiche Domain wie die
-- Sitzung → Konto der Lehrkraft). Die Oberfläche bereinigt seit dem
-- selben Commit selbst (cleanHtml/safeImg in index.html). Hier die
-- zweite Reihe: der Server nimmt so etwas gar nicht erst an.
--
--   Avatar        voller Anker: ^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$
--                 (bisher nur der Anfang geprüft — ein " dahinter brach
--                 aus dem Attribut aus).
--   Product-Daten (scrum_apply_ops und scrum_room_restore, kind 'product'):
--                 images = höchstens 5 Bilder mit demselben Muster;
--                 goal  = kein gefährliches Tag (script, img, svg, iframe …),
--                 in Tags kein on…= und kein javascript:.
-- Bestehende Daten werden mit bereinigt (unten).
--
-- Prüfstand: supabase/tests/0228_scrum_xss.mjs
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Prüfungen
-- ─────────────────────────────────────────────────────────────
create or replace function scrum_img_ok(p text)
  returns boolean
  immutable
  set search_path = public
  language sql
as $$
  select coalesce(p ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$', false);
$$;

create or replace function scrum_html_ok(p text)
  returns boolean
  immutable
  set search_path = public
  language sql
as $$
  select p is null or not (
       p ~* '<\s*/?\s*(script|style|iframe|frame|frameset|object|embed|applet|img|image|picture|source|svg|math|link|meta|base|form|input|textarea|button|select|option|video|audio|track|template|noscript|portal)\M'
    -- nur INNERHALB eines Tags: im Editor-HTML ist ein < im Text immer
    -- &lt;, ein Satz wie „online = schnell“ oder „javascript:“ bleibt erlaubt.
    or p ~* '<[^>]*[\s"''/]on[a-z]+\s*='
    or p ~* '<[^>]*(javascript|vbscript)\s*:'
  );
$$;

-- Daten eines product-Objekts (main oder goal).
create or replace function scrum_product_ok(p_data jsonb)
  returns boolean
  immutable
  set search_path = public
  language sql
as $$
  select
    (not (p_data ? 'images')
     or (jsonb_typeof(p_data -> 'images') = 'array'
         and jsonb_array_length(p_data -> 'images') <= 5
         and not exists (select 1 from jsonb_array_elements(p_data -> 'images') x
                          where jsonb_typeof(x) <> 'string' or not scrum_img_ok(x #>> '{}'))))
    and (not (p_data ? 'goal')
         or (jsonb_typeof(p_data -> 'goal') = 'string' and scrum_html_ok(p_data ->> 'goal')))
    and (not (p_data ? 'name') or jsonb_typeof(p_data -> 'name') = 'string');
$$;

revoke all on function scrum_img_ok(text)       from public, anon, authenticated;
revoke all on function scrum_html_ok(text)      from public, anon, authenticated;
revoke all on function scrum_product_ok(jsonb)  from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) In die drei Schreibwege einhängen
-- ─────────────────────────────────────────────────────────────
-- Der heutige Rumpf wird gelesen und an genau einer Stelle ergänzt.
-- Fehlt die Stelle, bricht die Migration ab, statt still nichts zu tun.
do $mig$
declare
  v_src text;
  v_new text;
begin
  -- Avatar: Ende-Anker
  v_src := pg_get_functiondef('scrum_apply_member_patch(uuid, uuid, jsonb)'::regprocedure);
  v_new := replace(v_src,
    $a$(p_patch->>'avatar') !~ '^data:image/(jpeg|png|webp);base64,'$a$,
    $b$not scrum_img_ok(p_patch->>'avatar')$b$);
  if v_new = v_src then raise exception '0228: Stelle in scrum_apply_member_patch nicht gefunden'; end if;
  execute v_new;

  -- Speichern (Team und Lehrkraft)
  v_src := pg_get_functiondef('scrum_apply_ops(uuid, uuid, jsonb)'::regprocedure);
  v_new := replace(v_src,
    $a$      if octet_length(v_data::text) > v_no then$a$,
    $b$      if v_kind = 'product' and not scrum_product_ok(v_data) then
        return jsonb_build_object('ok', false, 'error', 'invalid_input', 'kind', v_kind, 'id', v_id);
      end if;
      if octet_length(v_data::text) > v_no then$b$);
  if v_new = v_src then raise exception '0228: Stelle in scrum_apply_ops nicht gefunden'; end if;
  execute v_new;

  -- Import / Backup einspielen (Lehrkraft)
  v_src := pg_get_functiondef('scrum_room_restore(text, jsonb, integer, integer)'::regprocedure);
  v_new := replace(v_src,
    $a$    if octet_length((v_it->'data')::text) > v_lim then$a$,
    $b$    if v_kind = 'product' and not scrum_product_ok(v_it->'data') then
      return jsonb_build_object('ok', false, 'error', 'invalid_input', 'kind', v_kind, 'id', v_id);
    end if;
    if octet_length((v_it->'data')::text) > v_lim then$b$);
  if v_new = v_src then raise exception '0228: Stelle in scrum_room_restore nicht gefunden'; end if;
  execute v_new;
end
$mig$;


-- ─────────────────────────────────────────────────────────────
-- 3) Bestand bereinigen
-- ─────────────────────────────────────────────────────────────
-- Avatare, die nicht passen, fallen weg (die Oberfläche zeigt dann die
-- Initiale). Bilder, die nicht passen, fallen aus der Liste. Ein Goal
-- mit gefährlichem Inhalt wird zu reinem Text (Tags entfernt) — der
-- Wortlaut bleibt erhalten, nur die Auszeichnung geht.
update scrum_members set avatar = null
 where avatar is not null and not scrum_img_ok(avatar);

update scrum_items i
   set data = jsonb_set(i.data, '{images}', coalesce((
                select jsonb_agg(x) from jsonb_array_elements(i.data -> 'images') x
                 where jsonb_typeof(x) = 'string' and scrum_img_ok(x #>> '{}')), '[]'::jsonb)),
       version = i.version + 1
 where i.kind = 'product' and jsonb_typeof(i.data -> 'images') = 'array'
   and exists (select 1 from jsonb_array_elements(i.data -> 'images') x
                where jsonb_typeof(x) <> 'string' or not scrum_img_ok(x #>> '{}'));

update scrum_items i
   set data = jsonb_set(i.data, '{goal}',
                to_jsonb(regexp_replace(i.data ->> 'goal', '<[^>]*>', ' ', 'g'))),
       version = i.version + 1
 where i.kind = 'product' and jsonb_typeof(i.data -> 'goal') = 'string'
   and not scrum_html_ok(i.data ->> 'goal');
