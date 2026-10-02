# Void Command

A browser-based, single-player 3D fleet strategy game inspired by Homeworld's fleet command gameplay. It uses an original setting, procedural ship models, and locally bundled Three.js. No account, server game state, or external assets are required to play.

Install Node.js 20 or newer, unzip the package, and open a terminal in the `void-command` folder. Run `npm run serve` and open `http://localhost:4173`. No dependency installation is needed. Keep the terminal open while playing; press Ctrl+C to stop the server.

Run `npm test` to verify the simulation. `dist/` contains the complete deployable game. A local web server is required; opening `index.html` directly from your filesystem will not load the JavaScript modules.

## Gameplay

Protect the Asterion carrier and destroy the enemy Revenant carrier. Resource collectors mine asteroids and deliver cargo to your carrier. Use resource units to build interceptors, corvettes, ion frigates, and collectors. The enemy sends strike groups and builds reinforcements.

Left click or drag to select ships; Shift adds to the selection. Right click a destination to move, a hostile ship to attack, or an asteroid to mine. Touch players select a ship, press a command, then tap a target. Two fingers pan the camera; pinch to zoom. Set altitude before issuing a movement order to move in three dimensions.

Alt + drag or right drag orbits the camera. Arrow keys pan. The mouse wheel and +/− controls zoom. Space opens the sensor view, P pauses, F focuses the selection, Ctrl + A selects combat ships, and ? opens the controls. M selects Move, A selects Attack, H selects Mine, and S stops selected ships.

Delta, Wall, and Claw formations apply to movement orders. Defensive ships fire within range, aggressive ships pursue nearby targets, and passive ships attack only on direct orders. Construction and movement orders can be planned while paused. Queued builds can be cancelled for a full refund.

Three.js is distributed under its MIT license in `dist/vendor/THREE-LICENSE.txt`.
