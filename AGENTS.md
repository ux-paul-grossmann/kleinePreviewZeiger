# Arbeitsregeln (gilt für jede Session, jeden Branch)

Kleinstmögliche Diffs. Bei Zweifel: nicht anfassen, sondern nachfragen.

1. **Plan zuerst, Code danach.** Vor Änderungen kurz auflisten, welche Dateien
   betroffen sind und was genau passiert. Bei größeren Änderungen auf Bestätigung
   warten — bei trivialen 1-Zeilen-Fixes nicht nötig.
2. **Nur die genannten Dateien/Komponenten anfassen.** Andere Sections, andere
   Dateien, globale CSS-Klassen: tabu, außer explizit erwähnt.
3. **Keine Refactors ohne Auftrag.** Kein Umbenennen, kein "Aufräumen", kein
   Umsortieren, keine Formatierungs-Änderungen an nicht erwähntem Code — auch
   wenn er unsauber wirkt. Auffälligkeiten kurz erwähnen, nicht selbst ändern.
4. **Keine neuen Dependencies** ohne Rückfrage.
5. **Bestehende Texte (Deutsch) nicht umschreiben/"verbessern"** — nur
   strukturell/technisch ändern, wenn nicht explizit um Text-Überarbeitung gebeten.
6. **Ein Feature/Fix pro Antwort.** Keine Bonus-Änderungen "während ich eh drin war".
7. **Keine Dateien löschen/umbenennen** ohne explizite Ansage.
8. Nach jeder Änderung: kurz zusammenfassen, welche Dateien geändert wurden und warum.
9. Bei zu vager Aufgabe: 1–2 kurze Rückfragen stellen statt in mehrere Richtungen zu raten.

### Definition of Done
- [ ] Nur die angefragte Änderung wurde gemacht
- [ ] Keine unangeforderten Dateien im Diff
- [ ] Bestehender Code/Content unverändert, wo nicht explizit gefordert
- [ ] Kurze Zusammenfassung der Änderung gegeben

### Ordnerstruktur (wichtig)
Es gibt nur **einen** aktiven Projektordner (`kleinePreviewZeiger`). Experimente laufen
über Git-Branches (siehe unten), nicht über kopierte Ordner. Falls du auf
weitere `kleinePreviewZeiger*`-Ordner stößt: nicht anfassen, das sind Altlasten, die
manuell aufgeräumt werden.

---

