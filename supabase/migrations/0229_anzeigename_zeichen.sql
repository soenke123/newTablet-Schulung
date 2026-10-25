-- ══════════════════════════════════════════════════════════════
-- Migration 0229 — Anzeigename: dieselben Zeichen wie bei der Registrierung
-- ══════════════════════════════════════════════════════════════
-- Fund (Sicherheitsprüfung 24.10.2026): api/signup.js erlaubt im
-- Anzeigenamen nur Buchstaben (mit Umlauten), Ziffern, Leerzeichen und
-- . _ - (DISPLAY_NAME_RE). update_display_name (0004) prüfte beim
-- späteren Ändern aber nur Länge und Steuerzeichen — „<svg onload=…>“
-- passte in die 24 Zeichen. Alle Anzeigestellen maskieren heute (Bestenlisten,
-- Räume, Pinnwände, Admin-Panel …), aber der Name steht an so vielen
-- Stellen bei anderen, dass eine künftig vergessene Stelle sofort ein
-- Einfallstor wäre. Deshalb gilt die Regel jetzt auch hier.
--
-- Bestehende Namen bleiben, wie sie sind; geprüft wird beim Ändern.
-- Fehler: 'invalid_chars' (gab es schon für Steuerzeichen).
--
-- Prüfstand: supabase/tests/0229_anzeigename_zeichen.mjs
-- ══════════════════════════════════════════════════════════════

do $mig$
declare
  v_src text;
  v_new text;
begin
  v_src := pg_get_functiondef('update_display_name(text)'::regprocedure);
  v_new := replace(v_src,
    $a$if v_trimmed ~ '[[:cntrl:]]' then$a$,
    $b$if v_trimmed ~ '[[:cntrl:]]' or v_trimmed !~ '^[A-Za-zÄÖÜäöüß0-9 ._-]+$' then$b$);
  if v_new = v_src then raise exception '0229: Stelle in update_display_name nicht gefunden'; end if;
  execute v_new;
end
$mig$;
