# Maxwell–Boltzmann Lab

An interactive, browser-based statistical mechanics laboratory for a three-dimensional classical ideal gas. It combines a real-time Three.js particle field with a live, normalized speed histogram and the exact Maxwell–Boltzmann probability density.

For a detailed derivation of the physical and numerical model, see [THEORY.md](THEORY.md).

For an implementation and cost analysis of adding particle–particle collisions, see [COLLISION_PHYSICS_FEASIBILITY.md](COLLISION_PHYSICS_FEASIBILITY.md).

For an explanation of cold-particle turnover under thermostat and DSMC modes, see [THERMAL_BATH_COLD_PARTICLE_FLUCTUATIONS.md](THERMAL_BATH_COLD_PARTICLE_FLUCTUATIONS.md).

## Run in the browser with GitHub Pages

This project can run directly from GitHub Pages without a server. The deployed files are the same optimized JavaScript, WebGL, and typed-array simulation used locally; GitHub Pages only delivers those static files. Physics updates, DSMC collisions, charting, and 3D rendering execute on each visitor's device, so publishing does not reduce numerical fidelity or impose a remote-compute limit. Performance still depends on the visitor's CPU/GPU, browser, selected particle count, and whether momentum space is enabled.

The repository includes [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). It tests the physics, builds the Vite application, and deploys `dist/` whenever `main` is pushed.

To enable it after creating the GitHub repository:

1. Push this project to the repository's `main` branch.
2. Open **Settings → Pages** in GitHub.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and run **Test and deploy to GitHub Pages**, or push another commit to `main`.
5. Use the URL reported by the deployment job. Project repositories normally publish at `https://USERNAME.github.io/REPOSITORY/`.

Vite uses relative production asset paths, so the same build works at a repository subpath, an account-level `github.io` site, or a custom domain.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

Useful verification commands:

```bash
npm test
npm run build
```

## Physical model

- The box has a user-selectable physical side length from 0.10–1.00 μm. Display coordinates are normalized to `[0, 1]`, while wall transit, collision cells, density, pressure, mean free path, velocities, and elapsed time remain in SI units.
- Each velocity component is independently sampled from `Normal(0, k_B T / m)`. Scalar speeds therefore follow the three-dimensional Maxwell–Boltzmann law.
- Collisionless mode uses noninteracting points. Optional hard-sphere DSMC mode performs stochastic, spatially local binary collisions that conserve pair momentum and kinetic energy. Wall collisions are perfectly elastic, and a triangle-wave coordinate fold handles any number of wall crossings in one update.
- At 1×, the visual clock advances 20 ns of physical time per wall-clock second; the current 0.01× default advances about 0.2 ns per second. This is a visualization scale, not a modification of the mechanics.
- The measured kinetic temperature is calculated from the actual ensemble using `T = m ⟨v²⟩ / (3 k_B)`. Finite samples fluctuate statistically around the target.
- The histogram uses every simulated particle, is normalized by `N × bin width`, and updates independently from rendering.

### Thermal bath

Thermal momentum exchange occurs only when a particle contacts a wall. With **Thermal bath** enabled, all six faces act as diffuse thermal reservoirs. Each wall contact is accommodated with probability `1 − exp(−ν × 1 ns)`, where `ν` is the wall-coupling control; otherwise it reflects specularly. No random bath event can occur during interior free flight.

With **Restrict bath to +X** enabled, only crossings of the +X wall are eligible for accommodation. The active face is shown with a faint amber surface overlay. Turning the restriction off applies the same thermal-wall rule to all six faces.

### Thermal-wall sampling and equilibrium

A wall is struck more frequently by fast particles than slow ones. Sampling the outgoing normal velocity from an ordinary half-Gaussian would therefore remove too much energy and incorrectly shift the simulated speed distribution to the left, even when the wall and gas temperatures match. The simulation avoids this collision-rate bias by sampling the magnitude of the outgoing normal velocity from the flux-weighted Rayleigh law, `v_n = sqrt(k_B T / m) sqrt(-2 ln U)`, while the two tangential components remain Gaussian. This makes the stationary distribution inside the box Maxwell–Boltzmann at the specified bath temperature.

When the bath and DSMC are disabled, wall reflections only reverse velocity components and each particle retains its speed, so a nonequilibrium collisionless ensemble cannot thermalize. With DSMC enabled and the bath off, elastic molecular collisions conserve total energy and momentum while redistributing them, allowing collisional relaxation. Changing the temperature sets a new wall-bath target and the ensemble approaches it stochastically through thermal wall contacts.

## Controls

- Temperature from 5–5,000 K with wall-mediated thermal relaxation
- Helium, neon, argon, nitrogen (N₂), xenon, and a Custom option that reveals the particle-mass input
- 100–50,000 simulated/rendered particles using a continuous count slider, with 10,000 at startup. Decreasing the count removes a uniformly random subset without resetting surviving particles; increasing it preserves the existing ensemble and adds uniformly positioned particles with Maxwell–Boltzmann velocities at the current target temperature.
- Play/pause, reset, a logarithmic 0.001×–3× physical time scale (0.01× default), a 0.10–1.00 μm box-side slider, wall-coupling rate, and histogram bin count beside the chart (100 bins by default)
- Nonequilibrium presets that set every particle to the theoretical mean speed or align all velocity vectors with the x, y, or z axis while preserving their signs and kinetic energy; each preset restarts the experiment clock and collision counters
- Permanently enabled speed coloring, analytical curve, characteristic-speed markers, and a reference grid that expands as the selected physical box shrinks
- Large side-by-side thermal-wall mode buttons: the six-face bath starts enabled, while the +X-only mode is available only when the bath is on and highlights the active thermal face
- Spatial hard-sphere DSMC collisions enabled by default, with a large highlighted ON/OFF button and live status directly below box size in the Simulation module; species collision-diameter presets, a 0.1–20 Å collision-diameter slider, adaptive collision cells, and live mean-free-path/Knudsen diagnostics remain available
- An independent 0.25×–2.5× nominal marker-size slider with automatic population-density and box-length compensation; collision diameter no longer changes rendered marker size
- Independent hot-, cold-, and speed-band focus modes, plus random single-particle tracking. The hot cutoff defaults to 750 m/s. The cold slider spans 0–500 m/s and the hot slider spans 0–5,000 m/s, while direct positive numeric entry may exceed either slider range. Top 1% and Bottom 1% buttons calculate the corresponding Maxwell–Boltzmann speed quantiles from the current temperature and particle mass. Speed-band focus selects particles within an adjustable center ± half-width window. A shared opacity control adjusts all nonfocused particles, matching highlights appear in physical and momentum space, and matching dashed cutoff markers appear on the speed-distribution chart.
- Double-click reset for every slider, plus a temperature field that accepts an empty draft and commits only on Enter or blur
- A toggleable, freely rotatable 3D momentum-space panel positioned between the equally tall physical-space and speed-distribution panels. The physical-space panel receives the largest width allocation, while the distribution panel uses a compact 3×3 observable grid. Momentum space contains every particle, is normalized to a ±5 thermal-momentum-standard-deviation cube, and refreshes at a reduced data cadence for performance.
- Live population indicators for number density in particles/cm³ and ideal-gas pressure in pascals
- Random single-particle tracking with a box-centered camera, trajectory trail, live position/speed readout, muted background particles, and distinct indicators for elastic-wall, thermal-wall, and DSMC collisions
- Mouse orbit, zoom, and pan in the 3D view

Particle markers are intentionally enlarged, user-adjustable, and are not to scale.

## Tests

The Vitest suite checks Gaussian component statistics, mean-square and mean speeds, histogram normalization, numerical normalization and percentile inversion of the analytical density, nonequilibrium presets, variable box scaling, elastic wall energy conservation, temperature and mass scaling, six-wall thermal relaxation, absence of interior bath perturbations, thermal-wall equilibrium, DSMC pair conservation, DSMC-driven isotropization, mean-free-path diagnostics, bath-off energy conservation, and buffer integrity. Statistical tests use deterministic pseudorandom samples and finite-sample tolerances rather than exact equality.

## Implementation notes

The simulation uses contiguous `Float32Array` buffers for positions, velocities, speeds, and colors, plus `Uint32Array` event counters for per-particle wall, thermal-accommodation, and DSMC collisions. Three.js renders all particles as one `Points` draw call using `BufferGeometry` and a small custom shader. React is not updated on animation frames; dashboard statistics and Chart.js each run on lower-frequency independent timers.

## License

This project is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). It permits downloading, sharing, and modifying the code for noncommercial purposes, including personal education and research and use by educational, charitable, and public research organizations. Commercial use is not granted by this license.
