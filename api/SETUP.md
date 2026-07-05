# Vercel-Setup für die Signup-Function

Die Signup-Function braucht **einen Service-Role-Key** als Env-Variable in Vercel, damit sie im Namen der Datenbank Nutzer und Profile anlegen kann. Der Key darf **NIE** ins Frontend, nur in Vercel-Env.

## Schritt 1 — Service-Role-Key aus Supabase holen

1. https://supabase.com/dashboard → Dein Projekt `mps-schulung-staging`
2. Linkes Menü ganz unten: **Project Settings** (Zahnrad)
3. **API** → Abschnitt „Project API keys"
4. Bei **service_role** auf **Copy** klicken (oder auf „Reveal", dann kopieren)
5. In einem sicheren Notizprogramm ablegen — den nächsten Absatz gleich weiter

> ⚠️ Der Key erlaubt jedem der ihn hat, **alle Sicherheitsregeln der DB zu ignorieren**. Behandle ihn wie ein Server-Admin-Passwort. Nicht in Chats posten, nicht ins Repo committen.

## Schritt 2 — In Vercel als Env-Variable eintragen

1. https://vercel.com/dashboard → Dein Projekt `new-tablet-schulung` (oder wie es heißt)
2. Oben Tab **Settings**
3. Links **Environment Variables**
4. Drei neue Variablen anlegen (Button „Add New"):

   | Name                          | Value                              | Environments             |
   |-------------------------------|------------------------------------|--------------------------|
   | `SUPABASE_URL`                | `https://rythalrubpnbbwpewxmc.supabase.co` | Production, Preview, Dev |
   | `SUPABASE_SERVICE_ROLE_KEY`   | (den Key aus Schritt 1)            | Production, Preview, Dev |
   | `FAKE_EMAIL_DOMAIN`           | `tablet-schulung.fake`             | Production, Preview, Dev |

   Bei jeder Variable auf **Save** klicken.

## Schritt 3 — Redeploy triggern

Env-Var-Änderungen greifen erst nach neuem Deploy.

- Entweder: einen leeren Commit pushen (`git commit --allow-empty -m "trigger deploy" && git push`)
- Oder in Vercel: Deployments-Tab → letzten Deploy anklicken → oben rechts **Redeploy**

## Schritt 4 — Testen dass Function läuft

Auf der Deploy-URL:

```
https://new-tablet-schulung.vercel.app/api/signup
```

Direkt im Browser aufrufen → sollte JSON zurückkommen:
```json
{"ok":false,"error":"method_not_allowed"}
```

Das ist gewollt — GET wird nicht unterstützt, nur POST. Aber die Antwort beweist, dass die Function erreicht wird.

Wenn stattdessen **404** kommt: Vercel hat die Function nicht deployed. Meist Ursache: `package.json` fehlt oder Dependencies wurden nicht installiert. Deployments-Tab öffnen → Build-Log lesen.

## Schritt 5 — Erster echter Signup

Sobald die Registrieren-UI auf der Landing steht (kommt gleich), klickst Du drauf, füllst aus und siehst ob es klappt. Falls Fehler kommt → Logs in Vercel-Dashboard unter **Functions** → `signup`.
