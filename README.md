# Hex Surface Match Prototype

Prototype for a hex-based match puzzle projected onto a gently curved saddle surface.

The game logic remains a 2D hex grid, while the board is rendered to a canvas texture and mapped onto a Three.js surface. Click picking is converted from the 3D surface hit back to UV coordinates and then to a hex cell.

## Run

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Prototype Features

- Hex 3-match rules: line match and cluster match
- Adjustable color count
- CanvasTexture mapped onto a mild 3D saddle surface
- Raycast picking from 3D surface back to 2D hex cells
- Swap, clear, falling, and refill animations
- View controls for rotate, tilt, and zoom
- Subtle breathing motion on the surface
