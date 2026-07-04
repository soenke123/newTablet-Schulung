/* ══════════════════════════════════════════════════════════════
   Supabase — öffentliche Client-Konfiguration
   ══════════════════════════════════════════════════════════════
   Diese Datei ist BEWUSST im Repo und darf öffentlich sein.
   - SUPABASE_URL ist eine reine Adresse.
   - SUPABASE_ANON_KEY ist ein JWT mit role='anon'. Die Sicherheit
     kommt über Row-Level-Security-Policies in der DB, nicht über
     das Geheimhalten dieses Keys.
   - Der service_role-Key gehört NIE hierher — der lebt nur in
     Vercel-Environment-Variablen.
   ══════════════════════════════════════════════════════════════ */

window.SUPABASE_URL      = 'https://rythalrubpnbbwpewxmc.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5dGhhbHJ1YnBuYmJ3cGV3eG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzcwNTgsImV4cCI6MjA5ODc1MzA1OH0.FlzVxMY6v9t9cGD5BS-V-vONzqSDcA9E8u4iLe4sN4M';
window.FAKE_EMAIL_DOMAIN = 'tablet-schulung.fake';
