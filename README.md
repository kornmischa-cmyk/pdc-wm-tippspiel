# WM-Tippspiel · PDC Darts-WM 2026/27

Tippspiel für die Mannschaft. Jedes Teammitglied legt ein Profil mit Name und 4-stelliger PIN an und tippt pro Match den Sieger, optional das exakte Satzergebnis.

**Punkte**
- Richtiger Sieger: 1 Punkt
- Zusätzlich exaktes Satzergebnis: +2 Punkte
- Ab Viertelfinale zählt alles doppelt (pro Runde in der Tabelle `rounds` einstellbar)
- Tippschluss ist der Anpfiff. Erst danach sieht man die Tipps der anderen.
- Bei Punktgleichheit entscheidet die Zahl der exakten Tipps.

**Technik:** Statische Seite (HTML/CSS/JS, kein Build) auf GitHub Pages, Daten in Supabase. Alle Schreibzugriffe laufen über Datenbankfunktionen, die die PIN prüfen. Die Tabellen selbst sind per Row Level Security gesperrt.

---

## Einrichtung (ca. 15 Minuten)

### 1. Supabase-Projekt anlegen
1. Auf [supabase.com](https://supabase.com) ein neues Projekt anlegen. Als Region empfiehlt sich Frankfurt (`eu-central-1`).
2. Den **SQL Editor** öffnen, den kompletten Inhalt von `supabase/schema.sql` einfügen und auf **Run** klicken.
3. Unter **Project Settings → API** (bzw. **API Keys**) zwei Werte kopieren:
   - Die **Project URL**
   - Den **anon** bzw. **publishable** key

   Der `service_role`- bzw. `secret`-Key gehört **nicht** in die App.

### 2. App konfigurieren
In `config.js` URL und Key eintragen, dazu optional Titel und Admin-Name.

### 3. Auf GitHub Pages veröffentlichen
1. Repository: [kornmischa-cmyk/pdc-wm-tippspiel](https://github.com/kornmischa-cmyk/pdc-wm-tippspiel)
2. Unter **Settings → Pages → Build and deployment** als Source **Deploy from a branch** wählen, dann den Branch `main` und den Ordner `/ (root)`.
3. Nach etwa einer Minute ist die App unter `https://kornmischa-cmyk.github.io/pdc-wm-tippspiel/` erreichbar.

### 4. Dich zum Admin machen
1. Die App öffnen und ein Profil anlegen.
2. In Supabase im **SQL Editor** ausführen:
   ```sql
   update public.players set is_admin = true where lower(name) = lower('Mischa');
   ```
3. Abmelden und neu anmelden. Danach erscheint unten der Tab **Admin**.

### 5. Automatik einrichten (Ergebnisse ohne Handarbeit)
1. Im Supabase **SQL Editor** ausführen und das Ergebnis kopieren. Es wird nur einmal angezeigt:
   ```sql
   select public.create_bot_token();
   ```
2. Im GitHub-Repo unter **Settings → Secrets and variables → Actions → New repository secret** drei Secrets anlegen:
   - `SUPABASE_URL`: die Project URL
   - `SUPABASE_ANON_KEY`: der anon/publishable key, derselbe wie in `config.js`
   - `BOT_TOKEN`: das Token aus Schritt 1
3. Test: **Actions → Supabase-Abgleich → Run workflow**. Der Lauf muss grün werden.
4. Die geplante Claude-Aufgabe pflegt ab dann `data/wm.json`. Jede Änderung wird automatisch übertragen und im Admin-Bereich unter **Automatik** protokolliert.

### 6. Link ans Team schicken
Fertig. Jeder legt sein Profil selbst an.

---

## Während der WM

Im Normalfall läuft alles automatisch: Die geplante Claude-Aufgabe sucht Spielplan und Ergebnisse im Web und schreibt sie nach `data/wm.json`. Die GitHub Action überträgt sie nach Supabase. Die Regeln dafür stehen in `automation/aufgabe.md`:
- Ein Ergebnis wird nur eingetragen, wenn zwei Quellen übereinstimmen.
- Bestehende Ergebnisse werden nie still überschrieben. Ein Widerspruch erscheint als **Konflikt** im Protokoll und lässt die Action rot werden. GitHub schickt dir dann eine Mail.
- Einen Konflikt löst du, indem du entweder das Ergebnis im Admin-Bereich korrigierst oder in `data/wm.json` beim betroffenen Spiel `"force": true` ergänzt.

Die folgenden Abschnitte sind der Notfallweg von Hand.

### Spielplan importieren
Sobald Auslosung und Sessionplan veröffentlicht sind (z. B. auf sport1.de), kann der Import erzeugt werden. Er wird unter **Admin → Import** eingefügt:

```json
[
  {"round": 1, "pos": 1, "player1": "Spieler A", "player2": "Spieler B", "starts_at": "2026-12-11 20:00"},
  {"round": 1, "pos": 2, "player1": "Spieler C", "player2": "Spieler D", "starts_at": "2026-12-11 20:45"}
]
```

- `round`: 1 = 1. Runde, 2 = 2. Runde, 3 = 3. Runde, 4 = Achtelfinale, 5 = Viertelfinale, 6 = Halbfinale, 7 = Finale
- `pos`: Position im Turnierbaum der jeweiligen Runde. Die Gewinner von Position 1 und 2 treffen in der nächsten Runde auf Position 1, die von 3 und 4 auf Position 2 und so weiter. **Wichtig:** Die Reihenfolge muss dem offiziellen Turnierbaum folgen, nicht der Reihenfolge im Spielplan. Sonst landen die Sieger in falschen Paarungen.
- `starts_at`: deutsche Zeit. Bei den späteren Runden reicht `round`, `pos` und `starts_at`, leere Felder bleiben unverändert.

### Ergebnisse eintragen
Unter **Admin → Spieltag** den Tag wählen, die Sätze eintragen und auf **Speichern** tippen. Danach passiert automatisch:
- Die Punkte werden neu berechnet.
- Der Sieger wird in die nächste Runde geschrieben.
- Ein korrigiertes Ergebnis zieht die Paarung in der nächsten Runde mit, solange dort noch kein Ergebnis steht.

Paarungen und Anstoßzeiten lassen sich im selben Formular von Hand ändern.

### Rundenformat prüfen
Die Tabelle `rounds` enthält die Best-of-Werte der WM 2025/26 (Runde 1 und 2: Best of 5, Runde 3 und Achtelfinale: Best of 7, Viertelfinale: 9, Halbfinale: 11, Finale: 13). **Diese Werte vor dem Turnier mit dem offiziellen Format abgleichen** und bei Bedarf im Supabase **Table Editor** ändern. Dort lässt sich auch der Punkte-Faktor pro Runde ändern.

### PIN vergessen
Unter **Admin → Profile** auf **PIN neu** tippen. Nach 8 falschen Versuchen ist ein Profil 15 Minuten gesperrt. Ein Admin-Reset hebt die Sperre auf.

---

## Bekannte Grenzen
- **Die PIN ist ein Teamschutz, keine Bank-Sicherheit.** Sie bremst „mal eben für jemand anderen tippen“, mehr nicht. Sie ist gehasht gespeichert. Im Browser des Nutzers liegt sie im `localStorage`, damit man nicht jedes Mal neu eingeben muss.
- **Freie Supabase-Projekte pausieren nach etwa einer Woche ohne Nutzung.** Während der WM ist das kein Problem. Vorher kannst du es im Dashboard reaktivieren.
- **Ändert sich ein Ergebnis der Vorrunde nachträglich**, bleiben bereits abgegebene Tipps für das Folgespiel an der Position „Spieler 1“ bzw. „Spieler 2“ hängen, nicht am Namen.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html`, `style.css`, `app.js` | Die App |
| `config.js` | Supabase-Zugang und Titel |
| `supabase/schema.sql` | Tabellen, Sicherheitsregeln, Funktionen. Kann erneut ausgeführt werden, ohne Daten zu löschen. |
| `data/wm.json` | Spielplan und Ergebnisse, gepflegt von der Automatik |
| `.github/workflows/sync.yml` | Überträgt `data/wm.json` nach Supabase |
| `automation/aufgabe.md` | Arbeitsanweisung für die geplante Claude-Aufgabe |
