# SmashDisplay

A stand-alone, projector-friendly penalty-count display for the [CRG Scoreboard](https://github.com/rollerderby/scoreboard). It shows every skater's roster number and current penalty count for both teams in a high-contrast, big-type layout designed to be readable across a derby track.

SmashDisplay is read-only, it subscribes to CRG's data and never writes anything back. It needs CRG Scoreboard running somewhere reachable on the network, but it is otherwise self-contained: no install and no build step — it ships with everything it needs, including a small bundled web server.

**Platform:** the one-click launchers are Windows `.cmd`/`.bat` files (Windows 10/11). The app itself is plain HTML/CSS/JS, so on macOS/Linux you can serve `index.html` with any static web server and open it in a browser.

## Run it

**Double-click `Start SmashDisplay.cmd`.** It starts a tiny local web server (a minimized "SmashDisplay server" window) and opens the board in a clean, full-screen app window (Chrome or Edge if installed; otherwise your default browser).

On first run, the Settings panel pops up so you can point it at CRG. After that it remembers your settings and goes straight to the live board.

> **Keep the minimized "SmashDisplay server" window open** while you use the board closing it stops the local server. The server runs from the bundled `python/` folder, so nothing needs to be installed. (If that folder is missing it uses a system Python; if there's no Python at all it opens the file directly, which only works when CRG is on this same PC.)

### CRG on another computer (same network)

This is why the launcher serves over `http://` instead of opening the file directly: browsers block a `file://` page from talking to any scoreboard except `localhost`, so a plain file would only work when CRG runs on this same PC. Served over `http://`, SmashDisplay can reach a CRG anywhere on the LAN.

To use it:
1. Launch SmashDisplay, open **Settings** (⚙ / `S`).
2. Set **CRG host** to the other computer's IP (e.g. `192.168.1.20`), **port** `8000`, **Save & reconnect**.
3. Status should flip to **CONNECTED**.

If it won't connect, on the laptop's browser visit `http://<host-ip>:8000/` — if CRG's page loads, the network is fine and the host/port in Settings just need to match. The host computer's firewall must allow inbound port 8000 (Windows usually prompts to "Allow access" the first time CRG runs).

### Just want to see it work?

Double-click **`Start SmashDisplay (Demo).bat`** — it seeds a fake roster for both teams and ticks penalties up on a timer, so you can confirm colors, foul-out, and the severity ramp look right on your projector before a real game. No CRG required.

## Moving SmashDisplay to another computer

Everything needed is **inside this folder** — including a bundled copy of Python (the `python/` subfolder) — so the target computer needs nothing installed.

1. Copy the **entire `SmashDisplay` folder**, keeping all files together (especially the `python/` subfolder), to the other computer — USB stick, network share, or cloud download.
2. Double-click **`Start SmashDisplay.cmd`**.
3. Set the CRG host/port in **Settings** (⚙ / `S`) and **Save & reconnect**.

What the other computer needs:

| Needed? | What | Notes |
|---|---|---|
| ✅ Included | **Python** | Bundled in the `python/` subfolder — don't delete it. No install required. |
| ✅ Built into Windows | **A web browser** | Microsoft Edge ships with Windows 10/11. (Chrome is used if present.) |
| ⚠️ Separate | **CRG Scoreboard, running** | The data source. Must be running on that computer or another on the same network — SmashDisplay only displays it. |

You do **not** need Node.js, npm, or the SmashTracker app.

> The bundled Python is the official Windows **embeddable** build (64-bit), which covers essentially all modern Windows 10/11 PCs. On a rare 32-bit or ARM machine, delete the `python/` folder and install Python from [python.org](https://www.python.org/downloads/) instead (tick "Add Python to PATH").

## Settings

Click the **⚙ gear** (top-right) or press **`S`** to open Settings:

| Setting | What it does |
|---|---|
| **CRG host** | IP or hostname of the machine running CRG Scoreboard. Use `localhost` if CRG is on this same computer, or e.g. `192.168.1.50` for another machine on the LAN. |
| **CRG port** | CRG's port — almost always `8000`. |
| **Layout** | **Blocks** (one row per skater, rectangular penalty bars) or **Grid** (one card per skater, big number + count). |
| **Show skater names** | Toggle names on/off. |
| **Show penalty codes** | Blocks layout only: prints the CRG penalty cue letter (B, C, A, …) inside each filled block, in the order received. |
| **Number size** | Scale the big roster numbers up or down for your projector. |
| **Name size** | Scale the skater names up or down. Names too long for their box still auto-shrink to fit. |

Settings are saved on this computer (browser `localStorage`), so you set the host once and forget it. **Save & reconnect** applies them.

## Keyboard shortcuts

| Key | What it does |
|---|---|
| `F` | Toggle full-screen (also hides header/footer chrome) |
| `N` | Show/hide skater names |
| `+` / `-` | Scale numbers up / down |
| `S` | Open/close Settings |

## Two layouts

- **Blocks** (default): one row per skater with rectangular penalty blocks that fill in green → yellow → red. Best for comparing severity across the whole roster at once.
- **Grid**: each skater is a card with a big roster number and big penalty count. Best for at-a-glance "who is this and how bad is it?" reads.

Pick the one your venue prefers in Settings.

## Visual encoding

- **Big number** = roster number
- **Number under it** (grid) = current penalty count
- **Block / pip row** = one slot per penalty up to the foul-out threshold; green → yellow → red as the count climbs
- **Red card with "FO"** = fouled out / expelled (count ≥ foul-out limit)
- **Team-tinted header bar + card border** = uses CRG's configured team colors

Skaters flagged **Not Skating** (or bench staff) in CRG's Teams tab are automatically hidden, matching CRG's own in-game screens.

The foul-out threshold is read live from CRG's rules (`Penalties.NumberToFoulout`), defaulting to 7.

## What it reads

Read-only WebSocket subscription to `ws://<host>:<port>/WS/`. Subscribed paths:

- `ScoreBoard.CurrentGame.CurrentPeriodNumber`
- `ScoreBoard.CurrentGame.Period(*).CurrentJamNumber`
- `ScoreBoard.CurrentGame.Rule(Penalties.NumberToFoulout)`
- `ScoreBoard.CurrentGame.Team(*).Name`
- `ScoreBoard.CurrentGame.Team(*).Color(fg|bg)`
- `ScoreBoard.CurrentGame.Team(*).Skater(*).RosterNumber`
- `ScoreBoard.CurrentGame.Team(*).Skater(*).Name`
- `ScoreBoard.CurrentGame.Team(*).Skater(*).Flags` — to hide Not Skating / bench staff
- `ScoreBoard.CurrentGame.Team(*).Skater(*).PenaltyCount`
- `ScoreBoard.CurrentGame.Team(*).Skater(*).Penalty(*).Code` — penalty cue letters (for the "Show penalty codes" option)

Nothing is written back to the scoreboard.

## URL overrides (optional)

The launchers cover normal use, but every setting also has a URL-param override if you ever want one (params win over saved settings):

```
index.html?host=192.168.1.50      # point at a specific CRG machine
index.html?layout=grid            # force grid layout
index.html?demo=1                 # demo mode
index.html?demo=1&n=8             # demo with 8 skaters per team
index.html?demo=1&fo=1            # demo, force a foul-out on each team
```

## Files

- `index.html` — page shell + settings panel
- `styles.css` — projector typography, theming, two layouts
- `app.js` — WS client, path router, render loop, settings, demo mode
- `Start SmashDisplay.cmd` — one-click launcher (live); serves over `http://127.0.0.1:8077`
- `Start SmashDisplay (Demo).bat` — one-click launcher (demo)
- `python/` — bundled Python runtime used by the launchers (keep with the folder; no install needed)

## Connection status

The pill in the top-right shows the live connection state: **connecting**, **connected**, **disconnected** (it auto-retries every 2s), **error**, or **demo mode**. If it stays on *connecting* / *disconnected*, check that CRG is running and that the host/port in Settings are correct.

## License

SmashDisplay's source is released under the **MIT License** — see [LICENSE](LICENSE). The bundled `python/` runtime is distributed under its own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). SmashDisplay is an independent, read-only companion to CRG Scoreboard and is not affiliated with the CRG project.
