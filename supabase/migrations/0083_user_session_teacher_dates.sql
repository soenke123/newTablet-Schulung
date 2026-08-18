-- ══════════════════════════════════════════════════════════════
-- Migration 0083 — user_session: die beiden Lehrkraft-Zeitstempel
-- ══════════════════════════════════════════════════════════════
-- Anlass ist die Profilseite von MPSkills (MPSkills/profil.html).
-- Sie zeigt, in welchem Zustand die Lehrkraft-Rolle steht — und
-- „wartet auf Freischaltung" ist ohne Datum eine Auskunft, mit der
-- niemand etwas anfangen kann: seit gestern oder seit sechs Wochen
-- führt zu zwei verschiedenen Reaktionen. Genau diese Frage soll
-- die Seite beantworten, ohne dass jemand nachfragen muss.
--
-- teacher_status steckt seit 0077 in der View, die beiden Stempel
-- daneben nicht. Sie stehen längst in profiles und werden dort vom
-- Trigger profiles_teacher_stamp_trg gesetzt (0077, §3) — hier wird
-- nichts Neues erhoben, nur durchgereicht.
--
-- ⚠️ Wie in 0053 und 0077: create-or-replace-view lässt weder
-- Umordnen noch Weglassen zu ("cannot drop columns from view").
-- Alle bisherigen Spalten in unveränderter Reihenfolge, das Neue
-- ans Ende. session.js liest mit select=* — es ist damit ohne
-- weitere Änderung in window.__session verfügbar.
--
-- teacher_decided_by bleibt bewusst draußen: die View liest der
-- Betroffene selbst, und wer ihn abgelehnt hat, ist eine Auskunft
-- über eine dritte Person und keine über ihn. Im Admin-Panel steht
-- die Spalte ohnehin zur Verfügung.
-- ══════════════════════════════════════════════════════════════

create or replace view user_session as
select
  p.id,
  p.school_id,
  p.cluster_id,
  p.account_name,
  p.display_name,
  p.status,
  p.is_admin,
  p.avatar_id,
  p.avatars_seen_at,
  s.name  as school_name,
  c.name  as cluster_name,
  coalesce(c.season, 0) as season,
  p.last_login_at,
  p.is_superadmin,
  p.teacher_status,
  p.teacher_requested_at,
  p.teacher_decided_at
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;

alter view user_session set (security_invoker = true);

grant select on user_session to authenticated;
