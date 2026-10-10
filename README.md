# 🏐 Volleyball Soundboard (Spotify, iPad Safari)

Persönliches, nicht-kommerzielles Soundboard: Button drücken → Spotify-Track startet an einer festgelegten Position
über den **Spotify Web Playback SDK**-Player im Browser → Audio über den mit dem iPad gekoppelten Bluetooth-Lautsprecher.

- React + TypeScript + Vite, **kein Backend, keine Datenbank**
- Login: OAuth 2.0 **Authorization Code with PKCE** (kein Client Secret)
- Start: **eine** Anfrage `PUT /me/player/play?device_id=…` mit `{ uris: [track], position_ms }`

> Status: **Phase 1–3** (Login, Player, „Spotify aktivieren“, Soundboard mit 6 Buttons, Editor mit Song-Suche,
> Startzeit, localStorage, Import/Export). Endzeit (`endMs`) folgt in Version 2.

---

## 1. Voraussetzungen

- Spotify **Premium** (die App-Besitzer:in muss Premium haben, sonst funktionieren Development-Mode-Apps nicht)
- Node.js ≥ 20 (getestet mit 24), npm
- GitHub-Account, Vercel-Account (kostenlos)
- iPad mit Safari (iPadOS aktuell), Bluetooth-Lautsprecher

## 2. Spotify Developer App erstellen

1. <https://developer.spotify.com/dashboard> → **Create app**
2. Name: `Volleyball Soundboard`, Beschreibung beliebig
3. **Redirect URIs** – exakt diese eintragen (jeweils „Add“):
   - `http://127.0.0.1:5173/callback` (lokal – **nicht** `localhost`, das lehnt Spotify ab)
   - `https://<DEIN-VERCEL-PROJEKT>.vercel.app/callback` (nach Schritt 7 nachtragen, siehe unten)
4. **Which API/SDKs are you planning to use?** → `Web API` **und** `Web Playback SDK` anhaken
5. Terms akzeptieren → **Save**
6. **Settings → User Management**: deinen eigenen Spotify-Account (Name + E-Mail des Accounts, mit dem du dich auf dem iPad anmeldest) eintragen.
   Development Mode erlaubt max. 5 Nutzer:innen; nicht eingetragene Accounts bekommen `403`.
   Falls das Dashboard den Owner-Account ablehnt, ist er bereits berechtigt.

## 3. Client ID eintragen

Die **Client ID** (Settings → Basic Information) ist öffentlich und darf ins Frontend.
Das **Client Secret wird nicht benötigt** – nirgends eintragen.

```powershell
Copy-Item .env.example .env.local
```

`.env.local`:

```
VITE_SPOTIFY_CLIENT_ID=<deine Client ID>
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
```

`.env.local` ist per `.gitignore` ausgeschlossen.

## 4. Redirect URI – exakt

| Umgebung | Wert in `VITE_SPOTIFY_REDIRECT_URI` **und** im Spotify-Dashboard |
|---|---|
| Lokal | `http://127.0.0.1:5173/callback` |
| Vercel | `https://<projekt>.vercel.app/callback` (deine echte Production-Domain) |

Groß-/Kleinschreibung, `https`, kein Slash am Ende – muss **zeichengenau** übereinstimmen.
Vercel-Preview-URLs (`…-git-…vercel.app`) funktionieren nicht, nur die Production-Domain.

## 5. Lokal starten (Desktop-Test)

```powershell
npm install
npm run dev
```

Dann **http://127.0.0.1:5173** öffnen (nicht `localhost`).
Desktop-Chrome/Safari/Edge funktionieren für einen ersten Test.

> ⚠️ Das iPad kann **nicht** gegen den lokalen Dev-Server testen: Spotify erlaubt `http` nur für `127.0.0.1`,
> und der Player braucht einen sicheren Kontext (HTTPS). Für das iPad → Vercel (Schritt 7).

## 6. GitHub

```powershell
git add .
git commit -m "Phase 1+2: Spotify PKCE + Web Playback SDK test"
git branch -M main
git remote add origin https://github.com/<user>/volleyball-soundboard.git
git push -u origin main
```

## 7. Vercel

1. <https://vercel.com/new> → GitHub-Repo importieren
2. Framework: **Vite** (wird erkannt). Build `npm run build`, Output `dist`
3. **Environment Variables** (Schritt 8) setzen → **Deploy**
4. Production-Domain ablesen, z. B. `https://volleyball-soundboard.vercel.app`
5. Diese Domain + `/callback` im **Spotify-Dashboard** als Redirect URI hinzufügen
6. Falls die Domain von deiner Env-Variable abweicht: Variable korrigieren → **Redeploy**
   (Vite baut `VITE_*`-Werte beim Build ein – Änderungen wirken erst nach neuem Deployment)

`vercel.json` leitet `/callback` auf `index.html` um.

## 8. Environment Variables (Vercel → Settings → Environment Variables, „Production“)

| Name | Wert |
|---|---|
| `VITE_SPOTIFY_CLIENT_ID` | deine Client ID |
| `VITE_SPOTIFY_REDIRECT_URI` | `https://<projekt>.vercel.app/callback` |

**Niemals** `VITE_SPOTIFY_CLIENT_SECRET` anlegen – alle `VITE_*`-Werte landen öffentlich im Browser.

## 9. iPad öffnen & testen

1. Bluetooth-Lautsprecher mit dem iPad koppeln, Lautstärke am iPad hoch
2. **Safari** (kein Privatmodus) → `https://<projekt>.vercel.app`
3. **Mit Spotify verbinden** → Login → Zustimmen
4. Warten bis „🟢 Spotify Player bereit“ → **🔊 Spotify aktivieren** tippen
5. **⚙️** (oben rechts) → Button wählen → im Suchfeld Song suchen **oder** Spotify-Link einfügen
   (Spotify-App → Song → Teilen → Link kopieren) → Treffer antippen → Startzeit `MM:SS` → **▶ Test** → **✓ Fertig**
6. Soundboard-Button tippen → Song startet bei der Startzeit
7. Anderen Button tippen → ersetzt den laufenden Song
8. **⏹ STOP** pausiert, **▶ WEITER** setzt fort
9. Bei Problemen: **Debug** aufklappen (Device ID, Track, Position, letzter Fehler)

Die Konfiguration liegt im `localStorage` des Safari-Profils auf dem iPad. **⬇ Export JSON** sichert sie als
`soundboard.json` (Dateien-App), **⬆ Import JSON** lädt sie zurück, **Reset** stellt die 6 Standard-Buttons her.

Tipps fürs Spiel: Einstellungen → Anzeige → **Automatische Sperre: Nie** (gesperrter Bildschirm kann Safari-Audio stoppen).
Die Lautstärke wird auf iOS nur über die Hardware-Tasten geregelt (Spotify-SDK kann sie dort nicht setzen).

## 10. Zum Home-Bildschirm hinzufügen

Safari → Teilen → **Zum Home-Bildschirm**. Ein Lesezeichen-Icon reicht.
Bewusst **kein** Standalone-/PWA-Modus: Standalone-Web-Apps haben auf iOS einen getrennten Speicher und
OAuth-Redirects verhalten sich dort unzuverlässig. Erst testen, wenn alles in Safari funktioniert.

---

## Technische Hinweise

- **Scopes:** `streaming`, `user-read-email`, `user-read-private` (laut Spotify für das Web Playback SDK nötig),
  `user-modify-playback-state` (Track an Position starten). Keine weiteren.
- **Tokens:** Access Token nur im Arbeitsspeicher. Refresh Token in `localStorage` (ohne Backend nötig, damit
  du nach Reload nicht neu einloggen musst). Refresh Tokens laufen nach 6 Monaten ab → dann neu verbinden.
  „Spotify trennen“ im Debug-Bereich löscht ihn.
- **Race Conditions:** max. eine Player-Anfrage gleichzeitig; ein neuer Tap ersetzt jede noch wartende Anfrage
  („last command wins“). Track und Startposition gehen in **einer** Anfrage raus – kein separates Seek.
- **Premium-Prüfung:** Seit Feb. 2026 liefert `/me` kein `product`-Feld mehr. Erkannt wird fehlendes Premium
  über das SDK-Event `account_error` bzw. `403 PREMIUM_REQUIRED`.
- **Endzeit (`endMs`):** Endzeit wird in Version 2 ergänzt (das SDK hat kein „stop at“; nur per Polling möglich).
- **Suche:** `GET /search` und `GET /tracks/{id}` brauchen keinen zusätzlichen Scope. Development Mode liefert
  max. 10 Treffer pro Anfrage; die Suche ist mit 400 ms Debounce entprellt, laufende Anfragen werden abgebrochen.
- **Import:** Importierte JSON-Dateien werden validiert (nur `spotify:track:`-URIs, nur Cover von `i.scdn.co`,
  max. 24 Buttons), damit keine fremden Inhalte ins UI gelangen.

## Spotify-Richtlinien

Nur offizielle SDK/API, keine Downloads, keine Aufnahme, kein DRM-Umgehen, Audio unverändert, nicht kommerziell.
Spotifys Developer Policy sagt außerdem „Spotify content may not be broadcasted“ – die Spotify-Nutzungsbedingungen
erlauben nur private Nutzung. Für ein Hobby-Spiel im Freundeskreis üblich; bei öffentlichen Vereins-/Turnier-
veranstaltungen mit Publikum ist Spotify rechtlich nicht vorgesehen (öffentliche Wiedergabe, in DE i. d. R. GEMA).
