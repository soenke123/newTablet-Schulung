-- ══════════════════════════════════════════════════════════════
-- Migration 0130 — Vokabeln als eigene Schicht
-- ══════════════════════════════════════════════════════════════
-- Vorarbeit für „Myth of Wordisland" (0131), aber bewusst NICHT
-- dessen Eigentum. Die Vokabelsätze bekommen ein eigenes Präfix
-- (vocab_) und leben ohne jedes Spiel:
--
--   · Das Alleine-Lernen wird ein zweites Werkzeug mit eigener
--     Metapher. Es übt auf denselben Listen — läge der Inhalt in
--     wi_*, müsste es die Tabellen eines Spiels anfassen, mit dem
--     es nichts zu tun hat.
--   · Eine Lehrkraft, die ihre Unit importiert hat, tut das genau
--     einmal. Der Import gehört deshalb zum Inhalt und nicht zur
--     Insel.
--
-- ── Was hier steht ────────────────────────────────────────────
--   1  vocab_sets        Ein Satz Vokabeln (Unit oder „Eigene")
--   2  vocab_items       Ein Wortpaar
--   3  vocab_progress    Wiedervorlage je Teilnehmer und Richtung
--   4  vocab_norm        Großzügig normalisieren
--   5  vocab_lev         Levenshtein ohne Erweiterung
--   6  vocab_answers     Was in dieser Richtung gilt
--   7  vocab_grade       exact | near | miss
--   8  vocab_spellings   Auswahl aus Schreibweisen DESSELBEN Wortes
--   9  vocab_choices     Auswahl aus anderen Wörtern
--  10  vocab_pick_next   Welches Wort kommt jetzt
--  11  vocab_record      Antwort verbuchen
--  12  vocab_sets_list / vocab_set_import / vocab_set_delete
--  13  Drei mitgelieferte Units
--
-- ── Die dreistufige Prüfung ───────────────────────────────────
-- Getippt wird zuerst. Was dann passiert, entscheidet der Abstand
-- zur richtigen Lösung:
--
--   exact  → richtig.
--   near   → fast: Auswahl aus Schreibweisen desselben Wortes,
--            und die eigene Falschschreibung steht mit darin.
--            Wer „hous" tippt, kann das Wort — ihm fehlt ein e,
--            und genau das soll er sehen.
--   miss   → daneben: Auswahl aus acht Wörtern. Das ist dann
--            Wiedererkennen statt Produzieren, und das ist bei
--            einem Wort, das man nicht kennt, die richtige Stufe.
--
-- Geprüft wird IMMER hier und nie im Gerät. Ein Client, der die
-- Lösung kennt, damit er sie vergleichen kann, hat sie auch im
-- Netzwerk-Tab — und dann steht sie nach der ersten Stunde im
-- Klassenchat.
--
-- ── Kein fuzzystrmatch ────────────────────────────────────────
-- Levenshtein steht als Erweiterung bereit, wird hier aber selbst
-- geschrieben. Grund ist die Prüfbarkeit: die Migrationen laufen
-- vor dem Einspielen durch pglite (Regel:
-- feedback_pglite_runs_migrations), und dort ist die Erweiterung
-- nicht da. Eine Abhängigkeit, die den Prüfstand ausschaltet,
-- kostet mehr als die zwanzig Zeilen hier.
--
-- Kein DROP — Idempotenz per `if not exists` und `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) vocab_sets — ein Satz Vokabeln
-- ─────────────────────────────────────────────────────────────
-- owner_id null = mitgeliefert und für jede Lehrkraft sichtbar.
-- owner_id gesetzt = „Eigene", und die sind PRIVAT (Entscheidung
-- 06.09.2026). Kein Teilen-Schalter: fünf Kolleginnen, die
-- dieselbe Unit tippen, sind eine Verschwendung — aber halbfertige
-- Listen, die im Kollegium sichtbar herumliegen, sind eine
-- Verabredung, die es an dieser Schule noch nicht gibt. Teilen
-- lässt sich später ergänzen; ein einmal geteilter Bestand wieder
-- einzusammeln, geht nicht.
create table if not exists vocab_sets (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  lang_from  text not null default 'de',
  lang_to    text not null default 'en',
  theme      text,
  level      text,
  owner_id   uuid references profiles(id) on delete cascade,
  school_id  uuid references schools(id)  on delete cascade,
  created_at timestamptz not null default now(),
  constraint vocab_sets_title_len check (char_length(title) between 1 and 60),
  -- Entweder mitgeliefert (beides null) oder jemandes Liste
  -- (beides gesetzt). Ein Satz mit Besitzer ohne Schule wäre bei
  -- einem Schulwechsel heimatlos.
  constraint vocab_sets_owned check ((owner_id is null) = (school_id is null))
);

comment on table vocab_sets is
  'Ein Satz Vokabeln. owner_id null = mitgeliefert (alle Lehrkräfte), sonst privat. '
  'Gehört bewusst keinem Werkzeug — Wordisland und das spätere Solo-Werkzeug üben auf denselben Sätzen.';
comment on column vocab_sets.lang_from is
  'Sprache der Spalte term. Heute immer de; die Struktur trägt la/fr/es ohne Änderung.';

create index if not exists vocab_sets_owner_idx on vocab_sets(owner_id);

alter table vocab_sets enable row level security;
grant select, insert, update, delete on vocab_sets to service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) vocab_items — ein Wortpaar
-- ─────────────────────────────────────────────────────────────
-- Weitere gültige Lösungen stehen als Array und nicht mit „/" im
-- Text: der Prüfer soll nicht auseinandernehmen, was der Import
-- schon getrennt hat. Wer „pupil / student" einfügt, bekommt zwei
-- Einträge im Array — und beide zählen.
create table if not exists vocab_items (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references vocab_sets(id) on delete cascade,
  term        text not null,
  translation text not null,
  alt         text[] not null default '{}',   -- weitere Fassungen von translation
  alt_term    text[] not null default '{}',   -- weitere Fassungen von term
  sort_order  int not null default 0,
  constraint vocab_items_term_len  check (char_length(term)        between 1 and 60),
  constraint vocab_items_trans_len check (char_length(translation) between 1 and 60)
);

comment on table vocab_items is
  'Ein Wortpaar. term steht in vocab_sets.lang_from, translation in lang_to.';

-- Doppelte Wörter im selben Satz gibt es nicht — und der Import
-- braucht die Regel als Angel für sein `on conflict`.
create unique index if not exists vocab_items_set_term_idx
  on vocab_items(set_id, lower(term));
create index if not exists vocab_items_set_idx on vocab_items(set_id, sort_order);

alter table vocab_items enable row level security;
grant select, insert, update, delete on vocab_items to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) vocab_progress — die Wiedervorlage
-- ─────────────────────────────────────────────────────────────
-- Am Teilnehmer und nicht am Konto: MPSkills-Schüler haben keines
-- (Regel 2 des Sicherheitsmodells). Der Lernstand lebt damit so
-- lange wie der Raum — für eine Unit reicht das, und es kostet
-- niemanden einen Login.
--
-- Die RICHTUNG steht im Schlüssel. „Haus → house" kann längst
-- sitzen, während „house → Haus" noch wackelt; eine gemeinsame
-- Zeile würde die beiden vermischen und beim Abfragen genau das
-- verstecken, was noch fehlt.
create table if not exists vocab_progress (
  participant_id uuid not null references skill_participants(id) on delete cascade,
  item_id        uuid not null references vocab_items(id) on delete cascade,
  dir            text not null check (dir in ('de_en', 'en_de')),
  box            int  not null default 0 check (box between 0 and 4),
  due_at         timestamptz not null default now(),
  seen           int  not null default 0,
  wrong          int  not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (participant_id, item_id, dir)
);

comment on table vocab_progress is
  'Karteikasten je Teilnehmer, Wort und Richtung. box 0..4, due_at trägt die Wiedervorlage.';

create index if not exists vocab_progress_due_idx
  on vocab_progress(participant_id, due_at);

alter table vocab_progress enable row level security;
grant select, insert, update, delete on vocab_progress to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) vocab_norm — großzügig, aber nicht beliebig
-- ─────────────────────────────────────────────────────────────
-- Was NICHT bestraft wird: Groß/klein, der Artikel vorn („das Haus"
-- = „Haus", „the house" = „house"), das „to" vor dem Infinitiv,
-- Satzzeichen, doppelte Leerzeichen, ß statt ss (auf der
-- Tablet-Tastatur eine Fingerübung, kein Rechtschreibfehler).
--
-- Was WOHL bestraft wird: fehlende Umlautpunkte. „Hauser" statt
-- „Häuser" ist ein Fehler — er landet dann als `near` in der
-- Schreibweisen-Auswahl, und genau dort gehört er hin.
create or replace function vocab_norm(p_s text)
  returns text
  immutable
  set search_path = public
  language sql
as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               btrim(replace(lower(coalesce(p_s, '')), 'ß', 'ss')),
               '^(to|the|a|an|der|die|das|den|dem|ein|eine|einen)\s+', ''),
             '[.,;:!?"()„“”]', '', 'g'),
           '\s+', ' ', 'g'));
$$;

comment on function vocab_norm(text) is
  'Vergleichsform einer Antwort. Artikel und „to" fallen weg, ß wird ss, Umlaute bleiben.';


-- ─────────────────────────────────────────────────────────────
-- 5) vocab_lev — Levenshtein, selbst geschrieben
-- ─────────────────────────────────────────────────────────────
-- Zwei Zeilen der Tabelle reichen (prev/cur), und wer sich um mehr
-- als drei Zeichen in der Länge unterscheidet, ist ohnehin nicht
-- „fast richtig" — dann wird gar nicht erst gerechnet.
create or replace function vocab_lev(p_a text, p_b text)
  returns int
  immutable
  set search_path = public
  language plpgsql
as $$
declare
  v_a  text := coalesce(p_a, '');
  v_b  text := coalesce(p_b, '');
  la   int  := length(v_a);
  lb   int  := length(v_b);
  prev int[];
  cur  int[];
  i    int;
  j    int;
  cost int;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  if abs(la - lb) > 3 then return abs(la - lb); end if;

  prev := array(select generate_series(0, lb));
  for i in 1..la loop
    cur    := array_fill(0, array[lb + 1]);
    cur[1] := i;
    for j in 1..lb loop
      cost := case when substr(v_a, i, 1) = substr(v_b, j, 1) then 0 else 1 end;
      cur[j + 1] := least(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 6) vocab_answers / vocab_prompt — was gilt, was steht da
-- ─────────────────────────────────────────────────────────────
create or replace function vocab_answers(p_item uuid, p_dir text)
  returns text[]
  stable
  set search_path = public
  language sql
as $$
  select case when p_dir = 'en_de'
              then array[i.term]        || i.alt_term
              else array[i.translation] || i.alt
         end
    from vocab_items i
   where i.id = p_item;
$$;

create or replace function vocab_prompt(p_item uuid, p_dir text)
  returns text
  stable
  set search_path = public
  language sql
as $$
  select case when p_dir = 'en_de' then i.translation else i.term end
    from vocab_items i
   where i.id = p_item;
$$;


-- ─────────────────────────────────────────────────────────────
-- 7) vocab_grade — exact | near | miss
-- ─────────────────────────────────────────────────────────────
-- Die Schwelle für „fast" hängt an der Wortlänge, und das ist
-- keine Feinheit: bei „egg" ist ein Zeichen daneben schon ein
-- anderes Wort („ego"), bei „grandmother" sind zwei Zeichen ein
-- Vertipper. Eine feste Zahl wäre für kurze Wörter zu gnädig und
-- für lange zu streng.
--
-- Gemessen wird an der LÖSUNG und nicht an der Eingabe. Sonst
-- entschiede die Länge des Fehlers über die Milde: „hous" (4) wäre
-- streng, „Hauser" (6) für „Haus" wäre gnädig — und damit genau
-- verkehrt herum, denn das eine ist ein fehlender Buchstabe und das
-- andere ein anderes Wort.
create or replace function vocab_grade(p_item uuid, p_dir text, p_input text)
  returns text
  stable
  set search_path = public
  language plpgsql
as $$
declare
  v_ans  text[];
  v_in   text := vocab_norm(p_input);
  v_a    text;
  v_na   text;
  v_tol  int;
  v_near boolean := false;
begin
  v_ans := vocab_answers(p_item, p_dir);
  if v_ans is null or v_in = '' then
    return 'miss';
  end if;

  foreach v_a in array v_ans loop
    v_na := vocab_norm(v_a);
    if v_na = v_in then
      return 'exact';
    end if;
    v_tol := case when length(v_na) >= 8 then 2
                  when length(v_na) >= 4 then 1
                  else 0 end;
    if vocab_lev(v_na, v_in) <= v_tol then
      v_near := true;
    end if;
  end loop;

  return case when v_near then 'near' else 'miss' end;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 8) vocab_spellings — die Auswahl bei „fast richtig"
-- ─────────────────────────────────────────────────────────────
-- Vier bis fünf Fassungen DESSELBEN Wortes, darunter die eigene
-- Falschschreibung. Die Ablenker entstehen aus den Fehlern, die
-- Kinder wirklich machen: Buchstabendreher, doppelter Konsonant,
-- stummes e weg, ie/ei vertauscht.
--
-- ⚠️ GENAU EINE Fassung darf richtig sein (Regel:
-- feedback_free_constant_double_answer). Jeder Kandidat wird
-- deshalb gegen vocab_norm der Lösung geprüft — ein Ablenker, der
-- sich nur im Artikel unterscheidet, wäre eine zweite richtige
-- Antwort, und das Kind hätte recht und bekäme unrecht.
create or replace function vocab_spellings(p_correct text, p_typed text)
  returns text[]
  immutable
  set search_path = public
  language plpgsql
as $$
declare
  v_w    text := btrim(coalesce(p_correct, ''));
  v_t    text := btrim(coalesce(p_typed, ''));
  v_len  int  := length(v_w);
  v_cand text[] := array[]::text[];
  v_out  text[] := array[]::text[];
  v_c    text;
  i      int;
  v_ch   text;
begin
  if v_w = '' then
    return array[]::text[];
  end if;

  -- Die eigene Fassung zuerst in den Topf: sie ist der lehrreichste
  -- Ablenker, weil das Kind sie wiedererkennt.
  if v_t <> '' then
    v_cand := v_cand || v_t;
  end if;

  -- Buchstabendreher in der Wortmitte
  if v_len >= 4 then
    i := greatest(2, (v_len / 2)::int);
    v_cand := v_cand || (substr(v_w, 1, i - 1) || substr(v_w, i + 1, 1)
                         || substr(v_w, i, 1) || substr(v_w, i + 2));
  end if;

  -- Doppelter Konsonant: der erste, der noch keiner ist
  for i in 2 .. greatest(v_len - 1, 1) loop
    v_ch := substr(v_w, i, 1);
    if v_ch ~ '[bcdfgklmnprstz]'
       and substr(v_w, i + 1, 1) <> v_ch
       and substr(v_w, i - 1, 1) <> v_ch then
      v_cand := v_cand || (substr(v_w, 1, i) || v_ch || substr(v_w, i + 1));
      exit;
    end if;
  end loop;

  -- ie/ei vertauscht — der Klassiker in beiden Sprachen
  if position('ie' in lower(v_w)) > 0 then
    v_cand := v_cand || regexp_replace(v_w, 'ie', 'ei');
  elsif position('ei' in lower(v_w)) > 0 then
    v_cand := v_cand || regexp_replace(v_w, 'ei', 'ie');
  end if;

  -- Stummes e am Ende: weg, wenn eines da ist, sonst dran
  if v_len >= 4 and right(v_w, 1) = 'e' then
    v_cand := v_cand || substr(v_w, 1, v_len - 1);
  elsif v_len >= 3 then
    v_cand := v_cand || (v_w || 'e');
  end if;

  -- Aussieben: leer, doppelt oder in Wahrheit richtig
  foreach v_c in array v_cand loop
    if v_c is not null and btrim(v_c) <> ''
       and vocab_norm(v_c) <> vocab_norm(v_w)
       and not (v_out @> array[v_c])
       and coalesce(array_length(v_out, 1), 0) < 3 then
      v_out := v_out || v_c;
    end if;
  end loop;

  -- Die Lösung dazu, dann fest durchmischt: die richtige Fassung
  -- darf nicht immer an derselben Stelle stehen, sonst lernt die
  -- Klasse die Position statt das Wort.
  v_out := v_out || v_w;
  return (select array_agg(x order by md5(x || v_w))
            from unnest(v_out) as t(x));
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 9) vocab_choices — die Auswahl bei „daneben"
-- ─────────────────────────────────────────────────────────────
-- Ablenker aus DENSELBEN Sätzen, die gerade geübt werden. Wörter
-- aus einem fremden Satz wären zu leicht auszuschließen — und die
-- Auswahl soll die Unit wiederholen, nicht das Ausschlussverfahren.
create or replace function vocab_choices(p_sets uuid[], p_item uuid, p_dir text, p_n int)
  returns text[]
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_right text;
  v_out   text[];
begin
  v_right := (vocab_answers(p_item, p_dir))[1];
  if v_right is null then
    return array[]::text[];
  end if;

  -- Das `limit` gehört IN die Unterabfrage. Steht es außen, begrenzt
  -- es die eine Zeile, die array_agg ohnehin liefert — und die
  -- Auswahl käme mit allen Wörtern der Unit heraus.
  select coalesce(array_agg(w), array[]::text[]) into v_out
    from (
      select w
        from (
          select distinct on (vocab_norm(w)) w
            from (
              select case when p_dir = 'en_de' then i.term else i.translation end as w
                from vocab_items i
               where i.set_id = any(p_sets)
                 and i.id <> p_item
            ) c
           where vocab_norm(c.w) <> vocab_norm(v_right)
           order by vocab_norm(w), random()
        ) u
       order by random()
       limit greatest(p_n - 1, 1)
    ) d;

  v_out := v_out || v_right;
  return (select array_agg(x order by md5(x || v_right))
            from unnest(v_out) as t(x));
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 10) vocab_pick_next — welches Wort kommt jetzt
-- ─────────────────────────────────────────────────────────────
-- Reihenfolge: erst was fällig ist (falsch beantwortet = in
-- Sekunden wieder da), dann was noch nie dran war, dann der Rest
-- nach Fälligkeit. Innerhalb einer Gruppe entscheidet der Zufall,
-- damit nicht die halbe Klasse dasselbe Wort auf dem Schirm hat.
create or replace function vocab_pick_next(
  p_participant uuid,
  p_sets        uuid[],
  p_mode        text default 'mixed'
)
  returns table (item_id uuid, dir text)
  volatile
  set search_path = public
  language sql
as $$
  select i.id, d.dir
    from vocab_items i
    cross join lateral (
      select unnest(case when p_mode = 'mixed'
                         then array['de_en', 'en_de']
                         else array[p_mode] end) as dir
    ) d
    left join vocab_progress pr
           on pr.participant_id = p_participant
          and pr.item_id = i.id
          and pr.dir = d.dir
   where i.set_id = any(p_sets)
   order by
     case when pr.participant_id is null then 1
          when pr.due_at <= now()        then 0
          else 2 end,
     coalesce(pr.due_at, now()),
     random()
   limit 1;
$$;


-- ─────────────────────────────────────────────────────────────
-- 11) vocab_record — Antwort verbuchen
-- ─────────────────────────────────────────────────────────────
-- Richtig: ein Fach weiter, Wiedervorlage später. Falsch: zurück
-- auf null und in einer halben Minute wieder da. Die Abstände sind
-- auf eine Unterrichtsstunde geschnitten und nicht auf Wochen —
-- das Langzeit-Fach bringt das Solo-Werkzeug mit.
create or replace function vocab_record(
  p_participant uuid,
  p_item        uuid,
  p_dir         text,
  p_ok          boolean
)
  returns void
  volatile
  set search_path = public
  language sql
as $$
  insert into vocab_progress (participant_id, item_id, dir, box, due_at, seen, wrong, updated_at)
  values (
    p_participant, p_item, p_dir,
    case when p_ok then 1 else 0 end,
    now() + case when p_ok then interval '2 minutes' else interval '30 seconds' end,
    1,
    case when p_ok then 0 else 1 end,
    now()
  )
  on conflict (participant_id, item_id, dir) do update set
    box    = case when p_ok then least(vocab_progress.box + 1, 4) else 0 end,
    due_at = now() + case when not p_ok then interval '30 seconds'
                          else (array[interval '2 minutes', interval '2 minutes',
                                      interval '8 minutes', interval '30 minutes',
                                      interval '2 hours'])[least(vocab_progress.box + 1, 4) + 1]
                     end,
    seen       = vocab_progress.seen + 1,
    wrong      = vocab_progress.wrong + case when p_ok then 0 else 1 end,
    updated_at = now();
$$;


-- ─────────────────────────────────────────────────────────────
-- 12) Die Ansicht der Lehrkraft
-- ─────────────────────────────────────────────────────────────
create or replace function vocab_sets_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  return jsonb_build_object('ok', true, 'sets', coalesce((
    select jsonb_agg(x order by x->>'mine', x->>'level', x->>'title')
      from (
        select jsonb_build_object(
                 'id',    s.id,
                 'title', s.title,
                 'theme', s.theme,
                 'level', s.level,
                 'from',  s.lang_from,
                 'to',    s.lang_to,
                 -- Sortierschlüssel und Anzeigemerkmal in einem:
                 -- '0' stellt die mitgelieferten nach vorn.
                 'mine',  case when s.owner_id is null then '0' else '1' end,
                 'count', (select count(*) from vocab_items i where i.set_id = s.id)
               ) as x
          from vocab_sets s
         where s.owner_id is null or s.owner_id = v_user
      ) t
  ), '[]'::jsonb));
end;
$$;

revoke all on function vocab_sets_list() from public;
grant execute on function vocab_sets_list() to authenticated;


-- Import: ein Textblock, eine Zeile je Wortpaar.
--
--   Haus - house
--   der Schüler - pupil / student
--   Tafel;board
--
-- Erkannt werden Tabulator, „ - " (auch mit Halbgeviert), Semikolon
-- und Gleichheitszeichen — in dieser Reihenfolge, weil ein
-- Bindestrich auch IM Wort vorkommt („T-Shirt") und der Tabulator
-- aus einer Tabelle nie mehrdeutig ist. Mehrere gültige Lösungen
-- trennt der Schrägstrich; das Komma bleibt frei, weil „Haus, das"
-- eine übliche Schreibweise ist.
--
-- Zeilen, die nicht aufgehen, werden GEZÄHLT und nicht verworfen:
-- die Lehrkraft bekommt „4 Zeilen konnte ich nicht lesen" und weiß,
-- dass sie nachsehen muss. Ein stiller Import, der die Hälfte
-- schluckt, fällt erst in der Stunde auf.
create or replace function vocab_set_import(
  p_title     text,
  p_text      text,
  p_theme     text default null,
  p_level     text default null,
  p_lang_from text default 'de',
  p_lang_to   text default 'en',
  p_set       uuid default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_school  uuid;
  v_set     vocab_sets;
  v_id      uuid;
  v_line    text;
  v_parts   text[];
  v_term    text;
  v_rest    text;
  v_tr      text[];
  v_tm      text[];
  v_added   int := 0;
  v_bad     int := 0;
  v_n       int := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select school_id into v_school from profiles where id = v_user;
  if v_school is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if p_set is not null then
    -- Nachtragen in eine eigene Liste. Ein mitgelieferter Satz
    -- (owner_id null) fällt hier durch: er gehört allen, und was
    -- allen gehört, ändert niemand im Vorbeigehen.
    select * into v_set from vocab_sets where id = p_set and owner_id = v_user;
    if v_set.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    v_id := v_set.id;
  else
    if (select count(*) from vocab_sets where owner_id = v_user) >= 40 then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
    end if;
    insert into vocab_sets (title, lang_from, lang_to, theme, level, owner_id, school_id)
    values (left(btrim(p_title), 60),
            coalesce(nullif(btrim(p_lang_from), ''), 'de'),
            coalesce(nullif(btrim(p_lang_to),   ''), 'en'),
            nullif(btrim(coalesce(p_theme, '')), ''),
            nullif(btrim(coalesce(p_level, '')), ''),
            v_user, v_school)
    returning id into v_id;
  end if;

  select coalesce(max(sort_order), 0) into v_n from vocab_items where set_id = v_id;

  foreach v_line in array string_to_array(replace(coalesce(p_text, ''), E'\r', ''), E'\n') loop
    v_line := btrim(v_line);
    continue when v_line = '';

    if position(E'\t' in v_line) > 0 then
      v_parts := string_to_array(v_line, E'\t');
    elsif v_line ~ ' [-–—] ' then
      v_parts := regexp_split_to_array(v_line, ' [-–—] ');
    elsif position(';' in v_line) > 0 then
      v_parts := string_to_array(v_line, ';');
    elsif position('=' in v_line) > 0 then
      v_parts := string_to_array(v_line, '=');
    else
      v_bad := v_bad + 1;
      continue;
    end if;

    v_term := btrim(coalesce(v_parts[1], ''));
    v_rest := btrim(coalesce(v_parts[2], ''));
    if v_term = '' or v_rest = '' or length(v_term) > 60 or length(v_rest) > 120 then
      v_bad := v_bad + 1;
      continue;
    end if;

    v_tm := regexp_split_to_array(v_term, '\s*/\s*');
    v_tr := regexp_split_to_array(v_rest, '\s*/\s*');
    if length(v_tr[1]) > 60 then
      v_bad := v_bad + 1;
      continue;
    end if;

    if (select count(*) from vocab_items where set_id = v_id) >= 300 then
      exit;
    end if;

    v_n := v_n + 1;
    insert into vocab_items (set_id, term, translation, alt, alt_term, sort_order)
    values (v_id, v_tm[1], v_tr[1],
            coalesce(v_tr[2:], '{}'), coalesce(v_tm[2:], '{}'), v_n)
    on conflict (set_id, lower(term)) do update set
      translation = excluded.translation,
      alt         = excluded.alt,
      alt_term    = excluded.alt_term;
    v_added := v_added + 1;
  end loop;

  -- Ein Satz ohne ein einziges Wortpaar ist kein Satz, sondern ein
  -- Missverständnis über das Format. Er wird wieder eingesammelt,
  -- damit die Liste der Lehrkraft nicht mit Leerhülsen zuwächst.
  if p_set is null and v_added = 0 then
    delete from vocab_sets where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'no_pairs', 'bad', v_bad);
  end if;

  return jsonb_build_object('ok', true, 'set', v_id, 'added', v_added, 'bad', v_bad);
end;
$$;

revoke all on function vocab_set_import(text, text, text, text, text, text, uuid) from public;
grant execute on function vocab_set_import(text, text, text, text, text, text, uuid) to authenticated;


create or replace function vocab_set_delete(p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  -- Nur eigene. Ein mitgelieferter Satz hat keinen Besitzer und ist
  -- damit hier nicht auffindbar — dieselbe Bauart wie überall:
  -- fremd und nicht vorhanden sehen gleich aus.
  delete from vocab_sets where id = p_id and owner_id = v_user;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function vocab_set_delete(uuid) from public;
grant execute on function vocab_set_delete(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 13) Drei mitgelieferte Units
-- ─────────────────────────────────────────────────────────────
-- Englisch, Klasse 5/6, je 30 Wörter, thematisch geschnitten:
-- Schule, Zuhause, Essen. Selbst zusammengestellt und aus keinem
-- Lehrwerk übernommen — eine Wortliste ist als SAMMLUNG geschützt,
-- und Unit-für-Unit nachzubauen wäre genau das. Was aus dem
-- eingeführten Buch kommt, kommt über den Import der Lehrkraft.
--
-- Feste IDs, damit ein zweiter Lauf dieselben Sätze trifft und
-- keine Kopien anlegt.
insert into vocab_sets (id, title, lang_from, lang_to, theme, level) values
  ('a0000000-0000-4000-8000-000000000001', 'Schule',  'de', 'en', 'Schule',  '5/6'),
  ('a0000000-0000-4000-8000-000000000002', 'Zuhause', 'de', 'en', 'Zuhause', '5/6'),
  ('a0000000-0000-4000-8000-000000000003', 'Essen',   'de', 'en', 'Essen',   '5/6')
on conflict (id) do update set
  title     = excluded.title,
  lang_from = excluded.lang_from,
  lang_to   = excluded.lang_to,
  theme     = excluded.theme,
  level     = excluded.level;

insert into vocab_items (set_id, term, translation, alt, sort_order) values
  ('a0000000-0000-4000-8000-000000000001', 'die Schule',        'school',        '{}', 1),
  ('a0000000-0000-4000-8000-000000000001', 'der Lehrer',        'teacher',       '{}', 2),
  ('a0000000-0000-4000-8000-000000000001', 'der Schüler',       'pupil',         array['student'], 3),
  ('a0000000-0000-4000-8000-000000000001', 'die Klasse',        'class',         '{}', 4),
  ('a0000000-0000-4000-8000-000000000001', 'das Klassenzimmer', 'classroom',     '{}', 5),
  ('a0000000-0000-4000-8000-000000000001', 'die Tafel',         'board',         array['blackboard'], 6),
  ('a0000000-0000-4000-8000-000000000001', 'der Stuhl',         'chair',         '{}', 7),
  ('a0000000-0000-4000-8000-000000000001', 'der Tisch',         'table',         array['desk'], 8),
  ('a0000000-0000-4000-8000-000000000001', 'das Buch',          'book',          '{}', 9),
  ('a0000000-0000-4000-8000-000000000001', 'das Heft',          'exercise book', '{}', 10),
  ('a0000000-0000-4000-8000-000000000001', 'der Stift',         'pen',           '{}', 11),
  ('a0000000-0000-4000-8000-000000000001', 'der Bleistift',     'pencil',        '{}', 12),
  ('a0000000-0000-4000-8000-000000000001', 'der Radiergummi',   'rubber',        array['eraser'], 13),
  ('a0000000-0000-4000-8000-000000000001', 'die Schere',        'scissors',      '{}', 14),
  ('a0000000-0000-4000-8000-000000000001', 'der Kleber',        'glue',          '{}', 15),
  ('a0000000-0000-4000-8000-000000000001', 'die Schultasche',   'schoolbag',     '{}', 16),
  ('a0000000-0000-4000-8000-000000000001', 'die Hausaufgaben',  'homework',      '{}', 17),
  ('a0000000-0000-4000-8000-000000000001', 'die Pause',         'break',         '{}', 18),
  ('a0000000-0000-4000-8000-000000000001', 'der Schulhof',      'schoolyard',    array['playground'], 19),
  ('a0000000-0000-4000-8000-000000000001', 'die Turnhalle',     'gym',           '{}', 20),
  ('a0000000-0000-4000-8000-000000000001', 'der Unterricht',    'lessons',       '{}', 21),
  ('a0000000-0000-4000-8000-000000000001', 'die Schulstunde',   'lesson',        '{}', 22),
  ('a0000000-0000-4000-8000-000000000001', 'der Stundenplan',   'timetable',     '{}', 23),
  ('a0000000-0000-4000-8000-000000000001', 'das Fach',          'subject',       '{}', 24),
  ('a0000000-0000-4000-8000-000000000001', 'die Note',          'mark',          array['grade'], 25),
  ('a0000000-0000-4000-8000-000000000001', 'die Prüfung',       'test',          array['exam'], 26),
  ('a0000000-0000-4000-8000-000000000001', 'die Bibliothek',    'library',       '{}', 27),
  ('a0000000-0000-4000-8000-000000000001', 'der Schulleiter',   'headmaster',    array['principal'], 28),
  ('a0000000-0000-4000-8000-000000000001', 'die Kreide',        'chalk',         '{}', 29),
  ('a0000000-0000-4000-8000-000000000001', 'das Lineal',        'ruler',         '{}', 30),

  ('a0000000-0000-4000-8000-000000000002', 'das Haus',          'house',         '{}', 1),
  ('a0000000-0000-4000-8000-000000000002', 'die Wohnung',       'flat',          array['apartment'], 2),
  ('a0000000-0000-4000-8000-000000000002', 'das Zimmer',        'room',          '{}', 3),
  ('a0000000-0000-4000-8000-000000000002', 'die Küche',         'kitchen',       '{}', 4),
  ('a0000000-0000-4000-8000-000000000002', 'das Badezimmer',    'bathroom',      '{}', 5),
  ('a0000000-0000-4000-8000-000000000002', 'das Schlafzimmer',  'bedroom',       '{}', 6),
  ('a0000000-0000-4000-8000-000000000002', 'das Wohnzimmer',    'living room',   '{}', 7),
  ('a0000000-0000-4000-8000-000000000002', 'der Garten',        'garden',        '{}', 8),
  ('a0000000-0000-4000-8000-000000000002', 'die Tür',           'door',          '{}', 9),
  ('a0000000-0000-4000-8000-000000000002', 'das Fenster',       'window',        '{}', 10),
  ('a0000000-0000-4000-8000-000000000002', 'das Bett',          'bed',           '{}', 11),
  ('a0000000-0000-4000-8000-000000000002', 'der Schrank',       'cupboard',      array['wardrobe'], 12),
  ('a0000000-0000-4000-8000-000000000002', 'das Sofa',          'sofa',          array['couch'], 13),
  ('a0000000-0000-4000-8000-000000000002', 'der Teppich',       'carpet',        '{}', 14),
  ('a0000000-0000-4000-8000-000000000002', 'die Lampe',         'lamp',          '{}', 15),
  ('a0000000-0000-4000-8000-000000000002', 'die Treppe',        'stairs',        '{}', 16),
  ('a0000000-0000-4000-8000-000000000002', 'der Keller',        'cellar',        array['basement'], 17),
  ('a0000000-0000-4000-8000-000000000002', 'das Dach',          'roof',          '{}', 18),
  ('a0000000-0000-4000-8000-000000000002', 'die Wand',          'wall',          '{}', 19),
  ('a0000000-0000-4000-8000-000000000002', 'der Boden',         'floor',         '{}', 20),
  ('a0000000-0000-4000-8000-000000000002', 'die Familie',       'family',        '{}', 21),
  ('a0000000-0000-4000-8000-000000000002', 'die Mutter',        'mother',        '{}', 22),
  ('a0000000-0000-4000-8000-000000000002', 'der Vater',         'father',        '{}', 23),
  ('a0000000-0000-4000-8000-000000000002', 'die Schwester',     'sister',        '{}', 24),
  ('a0000000-0000-4000-8000-000000000002', 'der Bruder',        'brother',       '{}', 25),
  ('a0000000-0000-4000-8000-000000000002', 'die Großmutter',    'grandmother',   '{}', 26),
  ('a0000000-0000-4000-8000-000000000002', 'der Großvater',     'grandfather',   '{}', 27),
  ('a0000000-0000-4000-8000-000000000002', 'das Kind',          'child',         '{}', 28),
  ('a0000000-0000-4000-8000-000000000002', 'der Schlüssel',     'key',           '{}', 29),
  ('a0000000-0000-4000-8000-000000000002', 'der Spiegel',       'mirror',        '{}', 30),

  ('a0000000-0000-4000-8000-000000000003', 'das Essen',         'food',          '{}', 1),
  ('a0000000-0000-4000-8000-000000000003', 'das Frühstück',     'breakfast',     '{}', 2),
  ('a0000000-0000-4000-8000-000000000003', 'das Mittagessen',   'lunch',         '{}', 3),
  ('a0000000-0000-4000-8000-000000000003', 'das Abendessen',    'dinner',        array['supper'], 4),
  ('a0000000-0000-4000-8000-000000000003', 'das Brot',          'bread',         '{}', 5),
  ('a0000000-0000-4000-8000-000000000003', 'das Brötchen',      'roll',          '{}', 6),
  ('a0000000-0000-4000-8000-000000000003', 'die Butter',        'butter',        '{}', 7),
  ('a0000000-0000-4000-8000-000000000003', 'der Käse',          'cheese',        '{}', 8),
  ('a0000000-0000-4000-8000-000000000003', 'das Ei',            'egg',           '{}', 9),
  ('a0000000-0000-4000-8000-000000000003', 'die Milch',         'milk',          '{}', 10),
  ('a0000000-0000-4000-8000-000000000003', 'das Wasser',        'water',         '{}', 11),
  ('a0000000-0000-4000-8000-000000000003', 'der Saft',          'juice',         '{}', 12),
  ('a0000000-0000-4000-8000-000000000003', 'der Apfel',         'apple',         '{}', 13),
  ('a0000000-0000-4000-8000-000000000003', 'die Banane',        'banana',        '{}', 14),
  ('a0000000-0000-4000-8000-000000000003', 'die Orange',        'orange',        '{}', 15),
  ('a0000000-0000-4000-8000-000000000003', 'die Erdbeere',      'strawberry',    '{}', 16),
  ('a0000000-0000-4000-8000-000000000003', 'das Gemüse',        'vegetables',    '{}', 17),
  ('a0000000-0000-4000-8000-000000000003', 'die Kartoffel',     'potato',        '{}', 18),
  ('a0000000-0000-4000-8000-000000000003', 'die Tomate',        'tomato',        '{}', 19),
  ('a0000000-0000-4000-8000-000000000003', 'die Karotte',       'carrot',        '{}', 20),
  ('a0000000-0000-4000-8000-000000000003', 'das Fleisch',       'meat',          '{}', 21),
  ('a0000000-0000-4000-8000-000000000003', 'das Hähnchen',      'chicken',       '{}', 22),
  ('a0000000-0000-4000-8000-000000000003', 'der Fisch',         'fish',          '{}', 23),
  ('a0000000-0000-4000-8000-000000000003', 'der Reis',          'rice',          '{}', 24),
  ('a0000000-0000-4000-8000-000000000003', 'die Nudeln',        'noodles',       array['pasta'], 25),
  ('a0000000-0000-4000-8000-000000000003', 'die Suppe',         'soup',          '{}', 26),
  ('a0000000-0000-4000-8000-000000000003', 'der Kuchen',        'cake',          '{}', 27),
  ('a0000000-0000-4000-8000-000000000003', 'die Schokolade',    'chocolate',     '{}', 28),
  ('a0000000-0000-4000-8000-000000000003', 'der Zucker',        'sugar',         '{}', 29),
  ('a0000000-0000-4000-8000-000000000003', 'das Salz',          'salt',          '{}', 30)
on conflict (set_id, lower(term)) do update set
  translation = excluded.translation,
  alt         = excluded.alt,
  sort_order  = excluded.sort_order;
