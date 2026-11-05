# Hedione's Ideal Gas Simulator

> **Launch the interactive simulation at [hedione.github.io/Ideal-Gas-Simulator](https://hedione.github.io/Ideal-Gas-Simulator/).** No installation is required.

Hedione's Ideal Gas Simulator is an interactive, browser-based statistical mechanics laboratory for a three-dimensional classical gas. It combines a real-time particle field, DSMC molecular collisions, thermal-wall interactions, a rotatable momentum-space view, and a live Maxwell–Boltzmann speed distribution.

The simulation is designed for exploring how temperature, molecular mass, population, volume, collision diameter, and thermal contact affect microscopic motion and ensemble statistics. All physics and rendering run locally in the visitor's browser; performance depends on the device, particle count, and enabled views.

## Local development

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

Verification commands:

```bash
npm test
npm run build
```

## Physical model

- The box has a logarithmically controlled physical side length from 0.01–1.00 μm, with 0.10 μm at startup. Display coordinates are normalized to `[0, 1]`, while wall transit, collision cells, density, pressure, mean free path, velocities, and elapsed time remain in SI units.
- Each velocity component is independently sampled from `Normal(0, k_B T / m)`. Scalar speeds therefore follow the three-dimensional Maxwell–Boltzmann law.
- Collisionless mode uses noninteracting points. Optional hard-sphere DSMC mode performs stochastic, spatially local binary collisions that conserve pair momentum and kinetic energy. Wall collisions are perfectly elastic, and a triangle-wave coordinate fold handles any number of wall crossings in one update.
- At the 1× default, the simulation advances about 0.1 ns (100 ps) of physical time per wall-clock second. A live ps/s or ns/s readout shows the physical rate at every time-scale setting.
- The measured kinetic temperature is calculated from the actual ensemble using `T = m ⟨v²⟩ / (3 k_B)`. Finite samples fluctuate statistically around the target.
- The histogram uses every simulated particle, is normalized by `N × bin width`, and updates independently from rendering.

### Thermal bath

Thermal momentum exchange occurs only when a particle contacts a wall. With **Thermal bath** enabled, visitors can use all six faces or select one or two specific faces from ±X, ±Y, and ±Z. The diffuse-reflection control is the direct probability that an eligible contact is completely thermally resampled: 0% is entirely specular and 100% resamples every eligible contact. No random bath event can occur during interior free flight.

One-face mode uses the main temperature. Two-face mode adds a second selected wall whose temperature initially tracks the main temperature and can be decoupled with **Disable matching**. Independently heated faces can drive a nonequilibrium energy flow through the gas. Selected faces are identified by faint surface overlays and live temperature badges.

### Thermal-wall sampling and equilibrium

A wall is struck more frequently by fast particles than slow ones. Sampling the outgoing normal velocity from an ordinary half-Gaussian would therefore remove too much energy and incorrectly shift the simulated speed distribution to the left, even when the wall and gas temperatures match. The simulation avoids this collision-rate bias by sampling the magnitude of the outgoing normal velocity from the flux-weighted Rayleigh law, `v_n = sqrt(k_B T / m) sqrt(-2 ln U)`, while the two tangential components remain Gaussian. This makes the stationary distribution inside the box Maxwell–Boltzmann at the specified bath temperature.

When the bath and DSMC are disabled, wall reflections only reverse velocity components and each particle retains its speed, so a nonequilibrium collisionless ensemble cannot thermalize. With DSMC enabled and the bath off, elastic molecular collisions conserve total energy and momentum while redistributing them, allowing collisional relaxation. Changing the temperature sets a new wall-bath target and the ensemble approaches it stochastically through thermal wall contacts.

The RMS Speed preset preserves initial kinetic energy while creating a nonequilibrium speed shell. Equal-temperature thermal walls can initially heat that shell before it returns toward equilibrium. See [the RMS temperature report](RMS_TEMPERATURE_REPORT.md) for the derivation, numerical checks, and limits of this behavior.

## Controls

- On each page load, choose **Walkthrough mode** or **Full access**. Full access opens the complete simulator immediately. The walkthrough starts with only the particle simulation and introduces population, simulation controls, temperature, momentum space, speed distribution, and focus/tracking one at a time. Complete each task to enable **Next task**, then **Next module** after the module's final task. Moving to a new module restores experiment settings to their defaults while preserving the gas view's zoom, orbit, and pan. **Full access now** opens everything at any point. Walkthrough progress lasts until the page is reloaded.
- Physical space, momentum space, and speed distribution stay visible in the upper workspace. Each lower control module scrolls vertically on its own. On narrower screens, scroll the lower control rail horizontally to reach other modules; at phone widths the top views use two rows. The distribution panel scrolls internally when its chart and observables exceed the available height.
- Temperature from 5–5,000 K with logarithmic sliders for both the main target and independent second wall, physical Kelvin readouts, and wall-mediated thermal relaxation. The main numeric field still supports exact entry.
- Helium, neon, argon, nitrogen (N₂), xenon, and a Custom option with a draftable particle-mass input that commits on Enter or blur
- 100–50,000 simulated/rendered particles using a continuous count slider, with 25,000 at startup. Decreasing the count removes a uniformly random subset without resetting surviving particles; increasing it preserves the existing ensemble and adds uniformly positioned particles with Maxwell–Boltzmann velocities at the current target temperature.
- Play/pause, a quick ensemble reset at current settings, and a persistent header with information and RESET SIMULATION actions. RESET SIMULATION restores every startup option without reloading the page. A logarithmic 0.01×–10× physical time scale (1× default) includes a live ps/s or ns/s rate; additional controls include a logarithmic 0.01–1.00 μm box-side slider (0.10 μm default), a 0–100% diffuse-reflection probability (100% default), and histogram bin count beside the chart (100 bins by default).
- A clearly labeled Starting Conditions section whose RMS Speed preset gives every particle the ensemble RMS speed without changing total kinetic energy or measured temperature. X/Y/Z presets align velocity vectors with the selected axis while preserving their signs and individual kinetic energies; each preset restarts the experiment clock and collision counters.
- Permanently enabled speed coloring, analytical curve, characteristic-speed markers, and a reference grid that cross-fades between power-of-two refinement levels. Each refinement doubles the divisions on both axes, splitting every square into four, while center axes use the same subdued color as other grid lines.
- A full-width thermal-bath control with All Faces, One Face, and Two Faces modes. One-face mode accepts any ±X/±Y/±Z wall; two-face mode adds another distinct wall and an optionally independent second temperature.
- Spatial hard-sphere DSMC collisions enabled by default, with a highlighted ON/OFF button beside the playback controls; species collision-diameter presets, a 0.1–20 Å collision-diameter slider, adaptive collision cells, and live mean-free-path/Knudsen diagnostics remain available. A live badge classifies the gas as continuum, slip, transitional, or free-molecular flow and displays both the applicable criterion and current Knudsen number.
- Particle marker diameter and occlusion controls. Diameter spans 0.1–50 Å and is rendered directly as `marker diameter / box side length`, independent of particle count or focus mode; its default-on match mode keeps the visual diameter synchronized with the collision diameter. Particle occlusion is off by default and can be enabled to use the depth buffer so only the nearest particles along each line of sight are visible.
- A hard-sphere packing-fraction indicator distinguishes dilute, physically credible gas settings from dense numerical stress tests. Warnings appear when particle count, collision diameter, and box size together exceed the dilute regime assumed by the ideal-gas/DSMC model.
- An optional massive Brownian tracer is integrated into the physical simulation. Its diameter and mass are adjustable, with a default mass of 10⁴ u. Elastic gas–tracer impacts conserve pair momentum and kinetic energy, wall impacts are specular, and a focus button can dim the gas cloud around its visible trajectory.
- A live map-style length bar in the physical view is calculated from camera projection and the current box side length, so it remains physically accurate while box length, orbit, or zoom changes.
- Independent hot-, cold-, and speed-band focus modes, plus random single-particle tracking. The hot cutoff defaults to 750 m/s. The cold slider spans 0–500 m/s and the hot slider spans 0–5,000 m/s, while direct positive numeric entry may exceed either slider range. Top 1% and Bottom 1% buttons calculate the corresponding Maxwell–Boltzmann speed quantiles from the current temperature and particle mass. Speed-band focus selects particles within an adjustable center ± half-width window. A shared opacity control adjusts all nonfocused particles, matching highlights appear in physical and momentum space, and matching dashed cutoff markers appear on the speed-distribution chart.
- Double-click reset for every slider, plus a temperature field that accepts an empty draft and commits only on Enter or blur
- A freely rotatable 3D momentum-space panel that starts enabled and has a large ON/OFF control for reducing GPU load when needed, plus an independent point-size slider and live kg·m/s scale bar. It sits between the equally tall physical-space and speed-distribution panels. The physical-space panel receives the largest width allocation, while the distribution panel uses a compact 3×3 observable grid. Momentum space contains every particle, is normalized to a ±5 thermal-momentum-standard-deviation cube, and refreshes at a reduced data cadence for performance.
- Live population indicators for number density in particles/cm³ and ideal-gas pressure in pascals
- Random single-particle tracking with neutral-cyan point highlighting matching the hot/cold/band focus style, a trajectory trail, live position/speed readout, muted background particles, and distinct indicators for elastic-wall, thermal-wall, and DSMC collisions
- Camera-linked x/y/z orientation axes in the physical view, using the same red/green/blue convention as momentum space, plus a modal information guide that explains the model and its limits without leaving the simulation
- Mouse orbit, zoom, and pan in the 3D view

Particle marker diameter is rendered at its physical ratio to the box. At diameters below one device pixel, alpha coverage preserves projected area, though no raster display can show literal subpixel geometry.

## Tests

The Vitest suite checks Gaussian component statistics, mean-square and mean speeds, histogram normalization, numerical normalization and percentile inversion of the analytical density, energy-preserving nonequilibrium presets, RMS-shell thermal transients and emitted wall energy, conservative Brownian tracer impacts, variable box scaling, elastic wall energy conservation, temperature and mass scaling, six-wall thermal relaxation, absence of interior bath perturbations, thermal-wall equilibrium, DSMC pair conservation, DSMC-driven isotropization, mean-free-path diagnostics, bath-off energy conservation, and buffer integrity. Statistical tests use deterministic pseudorandom samples and finite-sample tolerances rather than exact equality.

Walkthrough tests cover both-direction zoom, ordered tasks within modules, rejection of out-of-order actions, cumulative module visibility, completion, and immediate full access.

## Implementation notes

The simulation uses contiguous `Float32Array` buffers for positions, velocities, speeds, and colors, plus `Uint32Array` event counters for per-particle wall, thermal-accommodation, and DSMC collisions. Three.js renders the cloud with shared `BufferGeometry` and custom shaders. Optional occlusion mode performs a depth-only particle pass followed by a color pass restricted to the nearest fragments; the default additive mode uses the color pass alone. React is not updated on animation frames, while dashboard statistics and Chart.js run on lower-frequency independent timers.

Walkthrough order, prompts, and progression state live in `src/walkthrough.ts`. The tasks cover zooming both ways; changing population, increasing collision diameter, and enabling occlusion; speeding up and slowing down playback, changing box size, and trying a starting condition; heating to at least 500 K, selecting one thermal face, and cooling below 10 K; adjusting momentum point size and orbiting its 3D view; changing histogram bins; and enabling a focus mode. The occlusion task starts with collision and marker diameters at 20 Å, marker matching on, and occlusion off for a clear before/after comparison. The corresponding controls in `src/App.tsx` report those actions. The physical renderer reports actual zoom, while the momentum renderer detects user-driven rotation and supports Left/Right arrow keys during that task. Module transitions reset the existing gas model in place so the physical camera remains intact; the momentum view resets to its default camera.

## License

This project is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). It permits downloading, sharing, and modifying the code for noncommercial purposes, including personal education and research and use by educational, charitable, and public research organizations. Commercial use is not granted by this license.
