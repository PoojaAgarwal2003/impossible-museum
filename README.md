# PARADOX / The Impossible Museum

A walkable Three.js museum of spaces that should not exist. An ivory-and-brass atrium leads to three interactive exhibits through live, camera-relative portal views. All geometry, materials, sound, and visual effects are generated locally; fonts are bundled.

![PARADOX: an ivory-and-brass museum atrium with live arched portals and an invitation to explore](docs/images/arrival.png)

## Start

Requires Node.js **22.18+** (Node 24 recommended) and a current browser with **WebGL 2 and hardware acceleration**.

```powershell
Set-Location 'C:\Users\primaurya\OneDrive - Microsoft\Documents\projects\impossible-museum'
.\start.ps1
```

Open **http://127.0.0.1:5175**. Stop the server with `Ctrl+C`. The Windows launcher uses the existing portable Copilot Node installation if Node is not on PATH and restores missing dependencies with `npm ci`.

Alternatively:

```powershell
npm ci
npm run dev
```

## The collection

| Exhibit | What happens |
| --- | --- |
| **01 / The Unfolded Hall** | A small arched doorway looks into a much larger space. Cross it to enter a monumental colonnade, then unfold its depth around a suspended golden Mobius strip. |
| **02 / The Gravity Garden** | Each side of the chamber is a planted walking surface. Shift gravity in quarter turns: your camera, walking plane, and return doorway reorient together. |
| **03 / The Museum Within** | A miniature atrium shares the original's geometry and animated sculpture. A framed live camera feed shows the full-sized atrium. Enter the model to descend one recursion level, then find it again. |

This is a designed spatial illusion, not a general-purpose physics or recursive-ray-tracing engine. Portals map the camera between separate scenes. The miniature reuses the atrium at a new narrative scale rather than allocating an unbounded number of nested worlds. Walking collisions cover room boundaries and major exhibits; decorative details are not a full physics mesh.

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D | Walk / strafe |
| Drag on the scene | Look around |
| Free look | Lock the mouse; Escape releases it |
| Arrow up / down; left / right | Walk forward / backward; turn |
| Shift | Walk faster |
| E / exhibit action button | Unfold space, shift gravity, or enter the miniature |
| R / Atrium button | Return to the original atrium, resetting recursion depth |
| Exhibit cards | Travel directly to a room |
| H / ? | Visitor guide and rendering settings |
| F | Fullscreen, where supported |
| Camera button | Download a PNG postcard without the interface |
| Sound button | Enable / mute a quiet, generated ambient chord |
| Touch | Swipe to look; on-screen directional buttons to walk |

Walk out through a room's return portal to keep your current recursion depth. Discoveries are saved in browser local storage; unavailable or invalid storage is reported without blocking exploration. Sound starts muted and only initializes after a gesture.

The guide includes low-power / balanced / high rendering, reduced motion, and animation pause. Reduced motion respects the initial operating-system preference, stops decorative animation, and makes gravity and room transitions immediate. Low-power rendering is the mobile default. Hidden tabs skip rendering and suspend enabled sound.

## Development

```powershell
npm test
npm run build
npm run preview
```

The production preview is at **http://127.0.0.1:4175**. The built `dist` directory can be hosted as a static site, including in a subdirectory.

For browser checks, start the development server first, then:

```powershell
npm run test:browser
```

Browser checks use Microsoft Edge on Windows by default, or Playwright Chromium elsewhere. Set `BROWSER_CHANNEL=chromium` to use installed Playwright Chromium; install it with `npx playwright install chromium` if needed. Set `MUSEUM_URL` to test another origin, such as the production preview. Screenshots and test artifacts go into the ignored `artifacts` directory.

## Implementation

- `src/world.ts`: procedural architecture, sculpture, planting, miniature, and scene lighting.
- `src/renderer.ts`: camera-relative portal rendering, destination clipping, bounded render scheduling, bloom, and postcards.
- `src/portal-math.ts`: independently tested camera mapping and clipping-plane calculations.
- `src/navigation.ts`: room metadata, movement, collision constraints, doorway crossings, and recursion labels.
- `src/main.ts`: exploration state, input, accessibility, exhibit mechanics, and UI.
- `src/audio.ts`: gesture-activated Web Audio ambience.

No runtime external requests, accounts, analytics, API keys, or downloaded art assets. No remote repository or deployment is configured automatically.
