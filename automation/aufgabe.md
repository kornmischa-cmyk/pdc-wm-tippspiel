# Arbeitsanweisung: Automatischer Abgleich WM-Tippspiel

Diese Datei steuert die geplante Claude-Aufgabe. Sie liegt im Repo, damit Anpassungen ohne neue Aufgabe möglich sind. Die geplante Aufgabe liest sie bei jedem Lauf und führt sie aus.

## Ziel
`data/wm.json` aktuell halten. Die Datei enthält alle Spiele der PDC Darts-WM 2026/27 mit Paarung, Beginnzeit und Ergebnis. Jeder Push auf `main` löst die GitHub Action aus, die die Datei nach Supabase überträgt. Die Tipprunde soll nichts von Hand eintragen müssen.

## Grundregeln (nicht verhandelbar)
1. **Nur Fakten aus Quellen.** Nichts schätzen, nichts aus dem Gedächtnis. Jede Paarung, jede Beginnzeit und jedes Ergebnis stammt aus einer aktuellen Websuche in diesem Lauf.
2. **Ergebnisse nur bei zwei übereinstimmenden Quellen.** Geeignet sind z. B. pdc.tv, sport1.de, dartsnews.com, flashscore, dartsdatabase, kicker, Sky Sports oder BBC. Findest du nur eine Quelle, trägst du nichts ein und versuchst es im nächsten Lauf erneut.
3. **Bestehende Ergebnisse nie ändern.** Steht in der Datei schon ein Ergebnis und eine Quelle sagt etwas anderes, änderst du nichts und meldest den Widerspruch. `force` setzt du nie selbst.
4. **Namen nicht umschreiben.** Steht ein Spieler schon in der Datei, übernimmst du exakt dessen Schreibweise.
5. **Sätze aus Sicht von player1/player2.** `sets1` gehört zu `player1`, `sets2` zu `player2`. Vor dem Eintragen immer prüfen, dass die Reihenfolge nicht vertauscht ist.
6. **Zeiten in deutscher Zeit** im Format `YYYY-MM-DD HH:MM`. Die PDC und britische Quellen nennen UK-Zeit, also +1 Stunde rechnen. Die Beginnzeit ist der Beginn des Matches, nicht der Session. Ist nur die Session-Startzeit und die Reihenfolge bekannt, nimm die Session-Startzeit. Sie ist dann der Tippschluss für alle Matches der Session, das ist gewollt und sicher.
7. **Lieber nichts als etwas Falsches.** Im Zweifel nicht schreiben, sondern melden.

## Ablauf je Lauf
1. Das Repo (main) frisch holen und `data/wm.json` lesen. Das heutige Datum in deutscher Zeit bestimmen.
2. Die Phase bestimmen:
   - **Phase A: noch keine Spiele der 1. Runde in der Datei.** Suche nach Auslosung, Turnierbaum und Spielplan der WM 2026/27.
     - Eintragen nur, wenn **Turnierbaum und Beginnzeiten** vorliegen. `pos` ergibt sich aus dem offiziellen Turnierbaum: von oben nach unten durchnummeriert, das oberste Match der 1. Runde ist `pos` 1. Die Reihenfolge im Spielplan ist dafür unbrauchbar. Die Gewinner von pos 1 und 2 treffen in Runde 2 auf pos 1, die von pos 3 und 4 auf pos 2 und so weiter. Prüfe die Zuordnung an zwei, drei bekannten Paarungen der 2. Runde, z. B. Gesetzte gegen Sieger aus der 1. Runde.
     - Liegt nur die Auslosung ohne Baumreihenfolge vor, schreibst du nichts und meldest das.
     - Prüfe außerdem das offizielle Format, also Best-of-Sätze pro Runde. Weicht es von der Tabelle unten ab, trägst du unter `rounds` `{"id": <Runde>, "best_of": <Sätze>}` ein.
   - **Phase B: Turnier läuft.**
     - Für jedes Spiel mit `starts_at` in der Vergangenheit und ohne Ergebnis suchst du das Ergebnis (Regel 2).
     - Für Spiele der kommenden 3 Tage ohne `starts_at` suchst du die Beginnzeit. Spiele späterer Runden legst du mit `round` und `pos` an und ergänzt nur `starts_at`. Die Spieler setzt die Datenbank automatisch aus den Siegern. Gib `player1`/`player2` trotzdem an, wenn sie feststehen. Prüfe dabei, dass sie zum Baum passen. Passen sie nicht, nichts schreiben und melden.
     - Ein Walkover oder eine Aufgabe vor Matchbeginn wird mit dem Sieger auf voller Satzzahl und 0 für den Gegner eingetragen. Das erwähnst du im Bericht.
   - **Phase C: das Finale hat ein Ergebnis.** Melde „WM abgeschlossen“ und empfiehl, die geplanten Aufgaben zu deaktivieren. Danach nichts mehr ändern.
3. Gibt es Änderungen: Setze `aktualisiert` auf den aktuellen Zeitstempel und ergänze genutzte Quellen-URLs in `quellen` (die letzten 20 genügen). Prüfe die Datei mit `jq empty data/wm.json` und committe auf `main`, z. B. „Ergebnisse 1. Runde: 6 Spiele“ oder „Spielplan 2. Runde“. Danach pushen.
4. Warte auf den Lauf der GitHub Action (`gh run list` / `gh run watch`) und lies das Ergebnis.
5. **Bericht an Mischa** als kurze Nachricht auf Deutsch:
   - Was eingetragen wurde, mit Anzahl und Beispielen.
   - Was fehlt und warum, z. B. „nur eine Quelle“.
   - Konflikte, Fehler der Action oder Unklarheiten. **Diese immer zuerst nennen.**
   - Gab es nichts zu tun, reicht ein Satz.

## Format von data/wm.json
```json
{
  "hinweis": "…",
  "aktualisiert": "2026-12-12T01:05:00+01:00",
  "quellen": ["https://…"],
  "rounds": [{"id": 1, "best_of": 5}],
  "matches": [
    {"round": 1, "pos": 1, "player1": "…", "player2": "…", "starts_at": "2026-12-11 20:00", "sets1": 3, "sets2": 1},
    {"round": 2, "pos": 1, "starts_at": "2026-12-19 14:00"}
  ]
}
```
- `round`: 1 = 1. Runde, 2 = 2. Runde, 3 = 3. Runde, 4 = Achtelfinale, 5 = Viertelfinale, 6 = Halbfinale, 7 = Finale. Bei 128 Spielern hat Runde 1 64 Spiele, Runde 2 32 und so weiter.
- Ein Ergebnis ist gültig, wenn eine Seite genau die nötige Satzzahl hat und die andere weniger. Nötig sind (Best of + 1) / 2 Sätze.
- Einträge nie löschen, nur ergänzen.

Aktuell hinterlegtes Format (Stand WM 2025/26): Runde 1 und 2 Best of 5, Runde 3 und Achtelfinale Best of 7, Viertelfinale 9, Halbfinale 11, Finale 13.
