# Antrags-Mails einrichten (Migration 0202)

Stellt eine Gruppe in der **Projektarbeit** einen Antrag („Lernen am anderen Ort“), bekommen die Lehrkräfte des Raums eine Mail. Die Mail geht über einen eigenen IServ-Account raus und nur an `@mps-ki.de`-Adressen, bleibt also in IServ.

```
Antrag wird „offen“ ──► Trigger ──► pa_mail_outbox
pg_cron (jede Minute) ──► mail_kick() ──(pg_net, nur wenn etwas fällig ist)──► POST /api/mail_dispatch
/api/mail_dispatch ──► pa_mail_claim() ──► SMTP (IServ) ──► pa_mail_done()
```

Gebündelt wird je Raum: eine Mail, sobald der älteste wartende Antrag 5 Minuten alt ist. In der Mail stehen nur Raumtitel, Gruppe und Datum, keine Schülernamen.

---

## Schritt 1: IServ-Account anlegen

1. In IServ einen Funktionsaccount anlegen, z. B. `antraege@mps-ki.de`, nur mit dem Recht für E-Mail.
2. Für diesen Account den Zugriff mit externen Mailprogrammen (SMTP) erlauben. Bei IServ heißt das je nach Version „E-Mail-Programme“ bzw. „Externer Zugriff“. Das muss eventuell der IServ-Admin freischalten.
3. Den SMTP-Server notieren, in der Regel `mps-ki.de` oder `mail.mps-ki.de`, Port **587** (STARTTLS).

## Schritt 2: Vercel-Umgebungsvariablen

Unter Vercel → Project → Settings → Environment Variables eintragen:

| Variable | Wert |
|---|---|
| `SMTP_HOST` | SMTP-Server aus Schritt 1 |
| `SMTP_PORT` | `587` (Standard; `465` = SSL direkt) |
| `SMTP_USER` | `antraege@mps-ki.de` |
| `SMTP_PASS` | Passwort des Accounts |
| `SMTP_FROM` | optional, z. B. `"MPS Projektarbeit" <antraege@mps-ki.de>` |
| `SITE_URL` | Adresse der Seite ohne `/` am Ende, z. B. `https://…vercel.app` (für die Links in der Mail) |
| `MAIL_DISPATCH_SECRET` | langes Zufallsgeheimnis, z. B. Ausgabe von `openssl rand -hex 32` |
| `MAIL_BCC_SELF` | optional `1`: jede Mail zusätzlich als BCC an den Account, als Protokoll |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` sind schon da (siehe `SETUP.md`). Danach **Redeploy**.

## Schritt 3: Supabase

1. Dashboard → Database → Extensions: **pg_cron** und **pg_net** aktivieren.
2. Migration `supabase/migrations/0202_antrag_mail.sql` im SQL-Editor ausführen. Wurden die Erweiterungen erst danach aktiviert, die Migration noch einmal ausführen; sie ist wiederholbar.
3. Ziel und Geheimnis eintragen (dasselbe Geheimnis wie in Vercel):

```sql
update mail_settings
   set dispatch_url    = 'https://<deine-domain>/api/mail_dispatch',
       dispatch_secret = '<MAIL_DISPATCH_SECRET>';
```

Prüfen, ob der Minutentakt läuft:

```sql
select jobname, schedule from cron.job where jobname = 'pa_mail_dispatch';
```

## Schritt 4: Ausprobieren

1. Als Lehrkraft einen Projektarbeit-Raum öffnen → in der Gruppen-Übersicht **🔕 Mail bei Anträgen** antippen.
2. IServ-Adresse eintragen und speichern. Innerhalb von etwa einer Minute kommt die Bestätigungsmail; den Link darin öffnen und **„Ja, bestätigen“** antippen.
3. Als Schüler einen Antrag stellen. Nach 5 bis 6 Minuten kommt die Mail.

### Wenn nichts ankommt

```sql
-- Wartet etwas? (note sagt, was passiert ist)
select id, created_at, claimed_at, attempts, sent_at, note
  from pa_mail_outbox order by id desc limit 20;

-- Hat pg_net Vercel erreicht? (status_code 200 = gut, 401 = Geheimnis falsch)
select id, status_code, content, created
  from net._http_response order by id desc limit 10;

-- Adresse bestätigt?
select email, verified_at, verify_sent_at, verify_tries from notify_email;
```

Fehler beim Versand (z. B. falsches SMTP-Passwort) stehen in den Vercel-Logs unter `/api/mail_dispatch`.

## Später: mehrere Lehrkräfte pro Raum

Wer die Mails bekommt, entscheidet nur `pa_room_teachers(room_id)` (heute: der Besitzer). Kommen weitere Lehrkräfte in einen Raum, wird nur diese Funktion erweitert. Adresse und Haken je Raum sind schon pro Lehrkraft gespeichert.
