# CTRL//Z — The Last Save

A browser game about recording yourself and fighting beside the echo.

Reality is a corrupted simulation. You can drop an anchor, move, then rewind. The path you just took stays in the world as an echo and holds pressure plates, trips switches, and swings if you swung. You come back at the anchor and move again.

## Play

From this folder:

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173`.

| Key | Action |
| --- | --- |
| A D or arrows | Move |
| Space | Jump. Hold for height. Press again in the air to double jump. |
| Shift | Dash |
| J or K | Pulse blade |
| Q | Drop an anchor. Rewinds return you here. |
| Z or Ctrl Z | Rewind and leave an echo of the recording |
| X | Dismiss echoes |
| R | Restart the level |
| Esc | Pause |
| M | Mute |

Echoes replay the recorded positions. They are not a second physics sim, so they do not desync. Lasers and pits ignore them. Plates, switches, enemies, and the final core do not.

Five levels. Local best times and ranks are stored in the browser. The save shape in `js/storage.js` is the seam for an online board later.

## Audio and type

Music and effects are synthesized in the browser. Inter and JetBrains Mono are included under the SIL Open Font License (`fonts/OFL.txt`).

## Tests

```bash
npm test
```
