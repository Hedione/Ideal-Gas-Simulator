# Hedione's Ideal Gas Simulator

> **Launch the interactive simulation at [hedione.github.io/Ideal-Gas-Simulator](https://hedione.github.io/Ideal-Gas-Simulator/).** No installation is required.

Hedione's Ideal Gas Simulator is an interactive, browser-based statistical mechanics laboratory for a three-dimensional classical gas. It combines a real-time particle field, DSMC molecular collisions, thermal-wall interactions, a rotatable momentum-space view, and a live Maxwell–Boltzmann speed distribution.

The simulation is designed for exploring how temperature, molecular mass, population, volume, collision diameter, and thermal contact affect microscopic motion and ensemble statistics. All physics and rendering run locally in the visitor's browser; performance depends on the device, particle count, and enabled views.

Additional background:

- [Theory and numerical model](THEORY.md)
- [Particle-collision feasibility and implementation analysis](COLLISION_PHYSICS_FEASIBILITY.md)
- [Cold-particle turnover under thermostat and DSMC modes](THERMAL_BATH_COLD_PARTICLE_FLUCTUATIONS.md)

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

Thermal momentum exchange occurs only when a particle contacts a wall. With **Thermal bath** enabled, visitors can use all six faces or select one or two specific faces from ±X, ±Y, and ±Z. Each eligible wall contact is accommodated with probability `1 − exp(−ν × 1 ns)`, where `ν` is the wall-coupling control; otherwise it reflects specularly. No random bath event can occur during interior free flight.

One-face mode uses the main temperature. Two-face mode adds a second selected wall whose temperature initially tracks the main temperature and can be decoupled with **Disable matching**. Independently heated faces can drive a nonequilibrium energy flow through the gas. Selected faces are identified by faint surface overlays and live temperature badges.

### Thermal-wall sampling and equilibrium

A wall is struck more frequently by fast particles than slow ones. Sampling the outgoing normal velocity from an ordinary half-Gaussian would therefore remove too much energy and incorrectly shift the simulated speed distribution to the left, even when the wall and gas temperatures match. The simulation avoids this collision-rate bias by sampling the magnitude of the outgoing normal velocity from the flux-weighted Rayleigh law, `v_n = sqrt(k_B T / m) sqrt(-2 ln U)`, while the two tangential components remain Gaussian. This makes the stationary distribution inside the box Maxwell–Boltzmann at the specified bath temperature.

When the bath and DSMC are disabled, wall reflections only reverse velocity components and each particle retains its speed, so a nonequilibrium collisionless ensemble cannot thermalize. With DSMC enabled and the bath off, elastic molecular collisions conserve total energy and momentum while redistributing them, allowing collisional relaxation. Changing the temperature sets a new wall-bath target and the ensemble approaches it stochastically through thermal wall contacts.

## Controls

- Temperature from 5–5,000 K with wall-mediated thermal relaxation
- Helium, neon, argon, nitrogen (N₂), xenon, and a Custom option with a draftable particle-mass input that commits on Enter or blur
- 100–50,000 simulated/rendered particles using a continuous count slider, with 25,000 at startup. Decreasing the count removes a uniformly random subset without resetting surviving particles; increasing it preserves the existing ensemble and adds uniformly positioned particles with Maxwell–Boltzmann velocities at the current target temperature.
- Play/pause, a quick ensemble reset at current settings, and a header-level RESET SIMULATION button that restores every startup option without reloading the page; plus a logarithmic 0.01×–100× physical time scale (1× default) with a live ps/s or ns/s rate, a logarithmic 0.01–1.00 μm box-side slider (0.10 μm default), wall-coupling rate, and histogram bin count beside the chart (100 bins by default)
- Nonequilibrium presets that set every particle to the theoretical mean speed or align all velocity vectors with the x, y, or z axis while preserving their signs and kinetic energy; each preset restarts the experiment clock and collision counters
- Permanently enabled speed coloring, analytical curve, characteristic-speed markers, and a reference grid that cross-fades between power-of-two refinement levels. Each refinement doubles the divisions on both axes, splitting every square into four, while center axes use the same subdued color as other grid lines.
- A full-width thermal-bath control with All Faces, One Face, and Two Faces modes. One-face mode accepts any ±X/±Y/±Z wall; two-face mode adds another distinct wall and an optionally independent second temperature.
- Spatial hard-sphere DSMC collisions enabled by default, with a large highlighted ON/OFF button below box size in the Simulation module; species collision-diameter presets, a 0.1–20 Å collision-diameter slider, adaptive collision cells, and live mean-free-path/Knudsen diagnostics remain available
- Particle marker diameter and occlusion controls. Diameter is expressed in ångströms and rendered directly as `marker diameter / box side length`, independent of particle count or focus mode; its default-on match mode keeps the visual diameter synchronized with the collision diameter. Particle occlusion is off by default and can be enabled to use the depth buffer so only the nearest particles along each line of sight are visible.
- A live map-style length bar in the physical view is calculated from camera projection and the current box side length, so it remains physically accurate while box length, orbit, or zoom changes.
- Independent hot-, cold-, and speed-band focus modes, plus random single-particle tracking. The hot cutoff defaults to 750 m/s. The cold slider spans 0–500 m/s and the hot slider spans 0–5,000 m/s, while direct positive numeric entry may exceed either slider range. Top 1% and Bottom 1% buttons calculate the corresponding Maxwell–Boltzmann speed quantiles from the current temperature and particle mass. Speed-band focus selects particles within an adjustable center ± half-width window. A shared opacity control adjusts all nonfocused particles, matching highlights appear in physical and momentum space, and matching dashed cutoff markers appear on the speed-distribution chart.
- Double-click reset for every slider, plus a temperature field that accepts an empty draft and commits only on Enter or blur
- A freely rotatable 3D momentum-space panel that starts enabled and has a large ON/OFF control for reducing GPU load when needed. It sits between the equally tall physical-space and speed-distribution panels. The physical-space panel receives the largest width allocation, while the distribution panel uses a compact 3×3 observable grid. Momentum space contains every particle, is normalized to a ±5 thermal-momentum-standard-deviation cube, and refreshes at a reduced data cadence for performance.
- Live population indicators for number density in particles/cm³ and ideal-gas pressure in pascals
- Random single-particle tracking with neutral-cyan point highlighting matching the hot/cold/band focus style, a trajectory trail, live position/speed readout, muted background particles, and distinct indicators for elastic-wall, thermal-wall, and DSMC collisions
- Mouse orbit, zoom, and pan in the 3D view

Particle marker diameter is rendered at its physical ratio to the box. At diameters below one device pixel, alpha coverage preserves projected area, though no raster display can show literal subpixel geometry.

## Tests

The Vitest suite checks Gaussian component statistics, mean-square and mean speeds, histogram normalization, numerical normalization and percentile inversion of the analytical density, nonequilibrium presets, variable box scaling, elastic wall energy conservation, temperature and mass scaling, six-wall thermal relaxation, absence of interior bath perturbations, thermal-wall equilibrium, DSMC pair conservation, DSMC-driven isotropization, mean-free-path diagnostics, bath-off energy conservation, and buffer integrity. Statistical tests use deterministic pseudorandom samples and finite-sample tolerances rather than exact equality.

## Implementation notes

The simulation uses contiguous `Float32Array` buffers for positions, velocities, speeds, and colors, plus `Uint32Array` event counters for per-particle wall, thermal-accommodation, and DSMC collisions. Three.js renders the cloud with shared `BufferGeometry` and custom shaders. Optional occlusion mode performs a depth-only particle pass followed by a color pass restricted to the nearest fragments; the default additive mode uses the color pass alone. React is not updated on animation frames, while dashboard statistics and Chart.js run on lower-frequency independent timers.

## License

This project is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). It permits downloading, sharing, and modifying the code for noncommercial purposes, including personal education and research and use by educational, charitable, and public research organizations. Commercial use is not granted by this license.
