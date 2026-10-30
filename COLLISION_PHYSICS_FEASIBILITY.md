# Feasibility and Design Study: Particle–Particle Collision Physics

## Executive summary

Adding physically meaningful particle–particle collisions is feasible at the application's existing population range of 5,000–50,000 particles, but the choice of algorithm matters more than raw particle count.

**Recommended approach:** implement an optional **Direct Simulation Monte Carlo (DSMC)** mode using a hard-sphere collision kernel, spatial collision cells, and Bird's No-Time-Counter-style pair selection. This is the best match for the current application because it:

- solves the dilute-gas Boltzmann collision process statistically;
- scales approximately as \(O(N+C)\), where \(N\) is particle count and \(C\) is the number of accepted/trial collisions;
- conserves pair momentum and kinetic energy exactly for elastic collisions;
- uses the existing typed-array positions and velocities;
- remains practical for 30,000–50,000 particles in a browser;
- supports nonequilibrium relaxation and heat transport from the one-sided thermal wall;
- does not require resolving an atomic diameter with tiny geometric timesteps.

**Not recommended as the primary mode:** frame-based geometric sphere overlap tests, Lennard-Jones molecular dynamics, or a full exact event-driven hard-sphere engine. Those methods are either numerically unsuitable for atomic length/time scales or disproportionately expensive to implement and maintain in a browser.

The recommended DSMC mode is statistically physical rather than a literal billiard-ball visualization: particles selected in the same collision cell exchange momentum as if they underwent a binary molecular collision, but their rendered points do not need to touch.

## Implementation status

The recommended phase-one and spatial DSMC design is now implemented in the application. It includes adaptive Cartesian collision cells, typed-array counting sort, hard-sphere No-Time-Counter-style trials, isotropic equal-mass scattering, collision substeps, molecular-diameter presets, custom diameter control, mean-free-path and Knudsen diagnostics, accuracy warnings, and automated conservation/relaxation tests. VHS/VSS transport models, Web Worker offloading, collision flashes, and mixtures remain possible future phases.

## 1. What “real collisions” can mean

There are two materially different goals:

1. **Kinetically correct gas physics.** The ensemble obeys the Boltzmann collision operator, conserves momentum and energy in binary encounters, relaxes toward Maxwell–Boltzmann equilibrium, and transports heat and momentum with a defined cross section.
2. **Geometrically exact contact trajectories.** Finite-radius spheres collide at the exact time their surfaces touch, like microscopic billiard balls.

For this application, goal 1 is scientifically more useful. The current particles represent dilute gas molecules, are visually enlarged, and have physical diameters roughly three thousand times smaller than the 1 μm box. DSMC targets goal 1 directly. Exact hard-sphere event-driven dynamics target goal 2, but with substantially higher engineering complexity.

## 2. Current architecture and constraints

The existing simulation has several favorable properties:

- positions, velocities, speeds, and colors are contiguous typed arrays;
- free flight is \(O(N)\) and already updates 50,000 particles;
- wall reflections robustly handle multiple crossings per update;
- rendering uses one GPU `Points` draw call;
- chart/statistics updates are decoupled from rendering;
- all particles have the same mass within a run;
- the browser has no backend dependency.

Important constraints are:

- animation and physics currently run on the main thread;
- the physical timestep changes with wall-clock frame duration and the time-scale control;
- the time-scale range spans 0.001×–3×, a factor of 3,000;
- visual point size is not a physical radius;
- the current ideal-gas mode deliberately has no particle–particle collisions;
- custom mass has no corresponding molecular collision diameter yet.

Any collision implementation should remain optional so the original collisionless ideal-gas experiment remains available and scientifically distinct.

## 3. Quantitative baseline for the current box

Consider the default Argon case:

- \(N=30{,}000\);
- \(L=1\ \mu\mathrm{m}\);
- \(V=L^3=10^{-18}\ \mathrm{m^3}\);
- \(T=300\ \mathrm K\);
- \(m=39.948\ \mathrm u\);
- representative Argon collision diameter \(d=3.542\ \text{Å}\).

The number density is

\[
n=\frac{N}{V}=3.0\times10^{22}\ \mathrm{m^{-3}}.
\]

For a hard-sphere gas, the mean free path is approximately

\[
\lambda=\frac{1}{\sqrt{2}\pi d^2 n}.
\]

Using the values above gives

\[
\lambda\approx5.98\times10^{-5}\ \mathrm m=59.8\ \mu\mathrm m.
\]

Thus the Knudsen number based on box size is

\[
\mathrm{Kn}=\frac{\lambda}{L}\approx59.8.
\]

This is a highly rarefied, nearly free-molecular regime. A typical molecule crosses the box many times before colliding with another molecule.

The mean Argon speed at 300 K is approximately \(399\ \mathrm{m/s}\), giving a per-particle collision frequency of roughly

\[
z\approx\frac{\bar v}{\lambda}\approx6.67\times10^6\ \mathrm{s^{-1}},
\]

or a mean collision time near 150 ns. The total binary collision rate is

\[
R\approx\frac{Nz}{2}\approx1.00\times10^{11}\ \mathrm{s^{-1}}
\]

of physical time. This large-looking number must be compared with the visualization clock: at the default 0.01× setting, one wall-clock second advances only about 0.2 ns. The displayed system would therefore experience only about **20 physical binary collisions per wall-clock second**.

| Population | Number density | Mean free path | Knudsen number | Pressure at 300 K | Collisions per displayed second at 0.01× |
|---:|---:|---:|---:|---:|---:|
| 30,000 | \(3.0\times10^{22}\ \mathrm{m^{-3}}\) | 59.8 μm | 59.8 | 124 Pa | ~20 |
| 50,000 | \(5.0\times10^{22}\ \mathrm{m^{-3}}\) | 35.9 μm | 35.9 | 207 Pa | ~56 |

These estimates use a constant hard-sphere diameter and are order-of-magnitude predictions, not a substitute for a temperature-dependent transport model.

### Consequence for the visual experience

Truly physical collisions will be sparse at the default playback rate. They can still be made visible with short-lived collision flashes or trails, but the application should not silently inflate the collision diameter to make collisions frequent. If a pedagogical collision-rate multiplier is added, it must be explicitly labeled as nonphysical.

## 4. Candidate methods

### 4.1 Naive all-pairs collision checks

Checking every pair costs

\[
\frac{N(N-1)}{2}.
\]

That is approximately 450 million pairs per update at 30,000 particles and 1.25 billion at 50,000. At 60 Hz this is impossible in a browser.

**Verdict:** reject.

### 4.2 Frame-based hard-sphere overlap detection with a spatial grid

A uniform grid or spatial hash reduces neighbor searches, but discrete overlap tests introduce a severe timestep problem. An Argon atom moving at 400 m/s crosses one 3.5 Å diameter in about

\[
\frac{d}{v}\approx0.9\ \mathrm{ps}.
\]

The current default playback advances about 3.3 ps per 60 Hz frame, already several diameters. At 3× it advances about 1 ns per frame, over one thousand diameters. Without many internal substeps, particles tunnel through each other; with enough substeps, cost becomes excessive.

A sparse hash avoids allocating billions of diameter-sized cells, but it does not solve continuous collision detection or timestep cost.

**Verdict:** unsuitable for physically sized particles across the current time-scale range.

### 4.3 Exact event-driven hard-sphere dynamics

Event-driven molecular dynamics analytically predicts the next pair or wall collision, stores events in time order, advances directly to the earliest event, updates the affected particles, and invalidates/reschedules dependent events. With suitable spatial sectors, event processing can approach \(O(\log N)\) per event.

Advantages:

- exact hard-sphere contact times;
- no tunneling;
- exact ballistic motion between events;
- excellent for rigid spheres at low density.

Costs and risks:

- priority queues, event invalidation, generation counters, and neighbor calendars are complex;
- every wall collision is also an event, and wall collisions are far more frequent than particle collisions in this high-Knudsen box;
- integration with a continuously changing thermostat, reset controls, particle count, mass, and time scale is difficult;
- robust handling of simultaneous/near-simultaneous events requires careful tolerances;
- 50,000 particles and high playback speed can produce millions of wall events per displayed second;
- the current mirrored-wall update would need a separate event-time architecture.

**Verdict:** scientifically valid but excessive for the product goal. Consider only as a separate reduced-population “exact hard spheres” experiment.

### 4.4 Lennard-Jones molecular dynamics

Lennard-Jones molecular dynamics computes continuous pair forces, typically with neighbor lists and a small integration timestep. It can model repulsion, attraction, virial pressure, and non-ideal behavior.

For atomic interactions the stable timestep is normally orders of magnitude smaller than the current physical frame increment. Achieving the application's 0.001×–3× time span would require many force evaluations per rendered frame. It would also change the scientific scope from an ideal/dilute gas to an interacting fluid.

Even with WebGPU, this would be a major new simulation engine, not a modest extension.

**Verdict:** reject for this application; appropriate only for a separate molecular-dynamics project.

### 4.5 Direct Simulation Monte Carlo

DSMC separates free motion from stochastic binary collisions. Particles are sorted into spatial cells, candidate pairs are selected within each cell, and accepted pairs undergo elastic scattering with probabilities determined by molecular cross section and relative speed.

Advantages:

- designed for dilute and rarefied gases;
- directly approximates the Boltzmann collision operator;
- no need to resolve molecular diameter geometrically;
- momentum and kinetic energy can be conserved exactly for every accepted pair;
- cost is linear in particle binning plus the number of trial collisions;
- naturally supports the current single thermal wall;
- well matched to typed arrays and the current split update loop.

Limitations:

- collisions are statistical, not literal rendered contacts;
- accuracy depends on cell size, timestep, particle count per cell, and collision statistics;
- transport coefficients depend on the chosen hard-sphere/VHS/VSS model;
- reproducibility requires a controlled random-number generator.

**Verdict:** recommended.

## 5. Recommended DSMC design

### 5.1 Phase-one molecular model

Start with an elastic hard-sphere model:

\[
\sigma_T=\pi d^2,
\]

where \(d\) is a species collision diameter. Add diameter presets for the existing gases and a required custom-diameter input when custom mass is selected.

Do not infer collision diameter from mass. Atoms/molecules with similar masses can have different interaction cross sections.

A later phase can add Bird's Variable Hard Sphere (VHS) model, in which effective cross section depends on relative speed and reproduces a chosen viscosity-temperature law. Variable Soft Sphere (VSS) scattering can further improve diffusion behavior, but it requires additional species parameters.

### 5.2 Spatial collision cells

Use a regular Cartesian grid only for collision partner selection. Do not create JavaScript arrays per cell. Use a counting-sort layout:

1. `cellCounts: Int32Array(cellCount)`;
2. `cellOffsets: Int32Array(cellCount + 1)` from prefix sums;
3. `particleIndices: Int32Array(N)`;
4. a temporary cursor array to fill cell-contiguous indices.

This gives deterministic \(O(N+N_{cells})\) binning with minimal allocation and good cache locality.

Choose grid resolution adaptively to keep roughly 40–100 particles per occupied cell:

- about \(4^3\) cells at 5,000 particles;
- about \(8^3\) cells at 30,000 particles;
- about \(9^3\) cells at 50,000 particles.

For the default Argon conditions these cells are much smaller than the mean free path, satisfying the principal DSMC spatial criterion while retaining enough simulator particles per cell for reasonable statistics.

### 5.3 Collision timestep

Use an internal fixed collision step independent of rendering. A conservative constraint is

\[
\Delta t_c\lesssim
\min\left(0.25\tau_c,\frac{0.5\Delta x}{g_{\max}}\right),
\]

where \(\tau_c\) is mean collision time, \(\Delta x\) is cell width, and \(g_{\max}\) is a conservative relative-speed bound.

Accumulate physical time from animation frames and process zero or more fixed collision substeps. At high playback speeds, cap work per rendered frame and expose a “simulation falling behind” indicator rather than silently increasing \(\Delta t_c\) beyond accuracy limits.

The existing particle motion can still use robust mirrored reflections, but positions must be updated/rebinned at each collision substep when spatial gradients matter.

### 5.4 No-Time-Counter-style pair selection

For a cell of volume \(V_c\), population \(N_c\), hard-sphere cross section \(\sigma_T\), maximum relative speed \(g_{\max}\), simulator weight \(W\), and step \(\Delta t_c\), the expected number of trial pairs is

\[
M_c=\frac{N_c(N_c-1)}{2}
\frac{W\sigma_T g_{\max}\Delta t_c}{V_c}.
\]

Use stochastic rounding for the fractional trial count. Randomly select distinct pairs and accept a hard-sphere trial with probability

\[
P_{ij}=\frac{g_{ij}}{g_{\max}},
\qquad
g_{ij}=\lVert\mathbf v_i-\mathbf v_j\rVert.
\]

If an observed \(g_{ij}\) exceeds the stored maximum, update the bound immediately. A safety factor or per-cell decaying maximum avoids persistent overestimation while preventing acceptance probabilities above one.

For the current model, each simulated particle represents one molecule, so \(W=1\). If statistical particle weights are added later, pressure, density, collision rate, and displayed population must clearly distinguish simulated particles from represented molecules.

### 5.5 Elastic equal-mass collision update

For a selected pair with equal mass, define center-of-mass and relative velocities:

\[
\mathbf V=\frac{\mathbf v_i+\mathbf v_j}{2},
\qquad
\mathbf g=\mathbf v_i-\mathbf v_j.
\]

Draw an isotropic unit vector \(\hat{\mathbf n}\) using

\[
\cos\theta=1-2U_1,
\qquad
\phi=2\pi U_2.
\]

Set \(\mathbf g'=\lVert\mathbf g\rVert\hat{\mathbf n}\), then

\[
\mathbf v_i'=\mathbf V+\frac{\mathbf g'}{2},
\qquad
\mathbf v_j'=\mathbf V-\frac{\mathbf g'}{2}.
\]

This conserves pair momentum and kinetic energy to floating-point precision:

\[
m\mathbf v_i'+m\mathbf v_j'
=m\mathbf v_i+m\mathbf v_j,
\]

\[
\frac{m}{2}\left(v_i'^2+v_j'^2\right)
=\frac{m}{2}\left(v_i^2+v_j^2\right).
\]

### 5.6 Interaction with thermostats

The update order should be explicit and tested:

1. move particles and apply wall interactions;
2. apply single-face thermal accommodation where applicable;
3. bin particles into collision cells;
4. execute particle–particle collisions;
5. update derived speeds/statistics.

With the bath off, collisions conserve total energy and momentum but redistribute them among particles. A deliberately nonequilibrium distribution can then relax toward Maxwell–Boltzmann without an external reservoir—unlike the current collisionless mode.

With the single thermal face on, intermolecular collisions carry energy away from the wall and create genuine collisional thermal transport. The current statement that one-face heating cannot produce a local thermodynamic field would need to be conditional on collision mode being off.

The all-face thermal-wall bath remains available, but its purpose overlaps with collision-driven equilibration. The UI should distinguish:

- **Collisionless + thermal walls:** reservoir relaxation through wall contact;
- **DSMC + bath off:** isolated collisional relaxation;
- **DSMC + thermal wall:** collisional heat transport;
- **DSMC + all thermal walls:** collisions plus boundary-reservoir coupling.

## 6. Expected computational cost

### 6.1 CPU time

At 30,000 particles and 60 Hz, one grid rebuild per frame is about 1.8 million particle-bin operations per second. At 50,000 it is about 3 million. These are modest counts for optimized typed-array JavaScript.

At the physically estimated default collision rate, accepted pair updates are only about 20 per displayed second for 30,000 Argon particles at 0.01×. Binning and random pair selection dominate cost, not the collision impulse calculation.

At 3×, the simulation advances 300 times more physical time per wall-clock second than at 0.01×, so collision trials and internal substeps can grow by more than two orders of magnitude. Adaptive render quality must not change the statistical particle population. Instead:

- keep collision physics on a fixed internal timestep;
- allow rendering to skip frames if necessary;
- cap accumulated catch-up work;
- show when real-time playback cannot be maintained.

An initial performance target should be a collision update budget of 2–4 ms per animation frame at 30,000 particles on a modern desktop, followed by measurement rather than assumption. The default physical case is likely to meet that budget; maximized collision multipliers or 3× playback may not.

### 6.2 Memory

Incremental memory is small:

- particle index list: \(4N\) bytes;
- linked/cursor or counting-sort buffers: another \(4N\) bytes at most;
- cell counts, offsets, and relative-speed maxima: typically tens of kilobytes;
- optional collision-event visualization buffers: bounded ring buffer.

For 50,000 particles, a practical CPU DSMC grid should add well under a few megabytes.

### 6.3 Main thread versus worker

Implement the first version on the main thread to avoid premature synchronization complexity. The current arrays and animation loop make this the shortest path to a validated model.

Move collision binning/selection to a Web Worker only if profiling shows repeated frame-budget overruns. Efficient worker operation would likely require `SharedArrayBuffer` plus appropriate cross-origin isolation headers, or double-buffered transfers. That is additional deployment and synchronization complexity.

WebGPU compute is not necessary for the expected physical collision rate and would increase browser-compatibility and validation burden.

## 7. Engineering effort and development cost

These are approximate single-engineer estimates for this codebase, assuming no major UI redesign:

| Option | Engineering effort | Risk | Suitable population | Scientific value |
|---|---:|---|---:|---|
| Homogeneous stochastic collisions, no grid | 2–4 days | Low | 50k+ | Equilibration only; no spatial transport |
| Spatial hard-sphere DSMC with tests/UI | 1–2 weeks (40–80 h) | Moderate | 5k–50k | Recommended; dilute-gas kinetics and transport |
| DSMC worker/performance hardening | +3–5 days | Moderate | 50k/high rate | Only if profiling requires it |
| Exact event-driven hard spheres | 3–6 weeks (120–240 h) | High | Start ≤5k | Exact contact trajectories, limited product benefit |
| Lennard-Jones molecular dynamics | 4–8+ weeks | Very high | Hardware-dependent | Different non-ideal-fluid project |

Monetary cost is the engineering hours multiplied by the applicable labor rate. No new runtime dependency is required for the recommended CPU DSMC implementation.

## 8. User-interface recommendations

Add an explicit collision model selector:

- **Collisionless ideal gas** (current behavior);
- **DSMC hard sphere**;
- later, optionally **DSMC VHS**.

For DSMC mode expose:

- molecular collision diameter in Å;
- physical/pedagogical collision-rate mode;
- collision-rate multiplier only behind a clear “nonphysical acceleration” label;
- grid resolution in an advanced section, with an automatic default;
- accepted collisions per physical nanosecond;
- mean free path, mean collision time, Knudsen number, and pressure;
- collision flashes toggle;
- a warning if timestep/cell accuracy criteria are violated.

Do not render particles at their collision diameter; continue to label points as visually enlarged. A collision flash should connect or briefly mark the selected pair without implying that the displayed marker radii touched.

## 9. Validation plan

### 9.1 Unit tests

1. Each binary collision conserves all three momentum components.
2. Each elastic collision conserves pair kinetic energy.
3. Relative-speed magnitude is unchanged by hard-sphere scattering.
4. Scattering directions are isotropic over many samples.
5. Cell assignment is correct at every boundary and never indexes out of range.
6. No pair contains the same particle twice.
7. NTC acceptance rates match analytical expectations in a controlled cell.
8. Bath-off total momentum and energy remain constant over long runs.
9. Extreme controls never introduce NaNs or unbounded buffers.

### 9.2 Statistical tests

1. A two-stream or monoenergetic nonequilibrium distribution relaxes toward Maxwell–Boltzmann with the bath off.
2. An equilibrium Maxwell–Boltzmann ensemble remains stationary under collisions.
3. Collision frequency follows \(n\sigma\langle g\rangle\) within finite-sample tolerance.
4. Mean free path scales as \(1/(nd^2)\).
5. Temperature remains constant in an isolated elastic run.
6. Center-of-mass velocity remains constant in an isolated run.
7. Thermal-wall heat transfer has the expected sign and approaches equilibrium.

### 9.3 Performance tests

Benchmark 5k, 10k, 30k, and 50k particles at:

- default physical cross section and 0.01×;
- 1×;
- 3×;
- maximum supported collision multiplier;
- uniform equilibrium and strong spatial gradients.

Record update time percentiles, allocations, dropped render frames, collision backlog, and statistical accuracy. Performance tests should run with rendering both enabled and disabled to separate GPU/display cost from collision cost.

## 10. Phased implementation plan

### Phase 1: homogeneous proof of physics

- Add a pure equal-mass collision kernel.
- Add deterministic seeded randomness for tests.
- Implement one-cell NTC selection.
- Demonstrate bath-off relaxation from a two-stream distribution.
- Validate momentum and energy conservation.

This phase establishes correctness without spatial transport.

### Phase 2: spatial DSMC

- Add counting-sort collision cells.
- Add adaptive grid sizing.
- Add fixed collision substeps and an accumulator.
- Integrate the single thermal face.
- Add mean-free-path and Knudsen diagnostics.
- Add accuracy warnings.

### Phase 3: product integration

- Add collision model and diameter controls.
- Add collision event visualization.
- Update explanatory UI and `THEORY.md`.
- Profile 30k and 50k modes.
- Preserve collisionless mode as the default scientific baseline unless the product goal changes.

### Phase 4: optional fidelity/performance

- Add VHS/VSS species parameters.
- Add a worker only if profiling justifies it.
- Add unequal-mass mixture formulas if multiple simultaneous species are introduced.
- Consider a separate reduced-count exact hard-sphere demonstration only if exact contact geometry is a core user requirement.

## 11. Final recommendation

Proceed with a CPU, typed-array, spatial DSMC hard-sphere mode. It is feasible at 30,000–50,000 particles, has modest incremental memory cost, and can be implemented without replacing the Three.js renderer or current free-flight engine.

The most important product decision is whether collisions should be physically rare or visually frequent. Under the current physical box size, population, and representative Argon diameter, rare collisions are the correct result. Preserve that as the physical mode. If a collision multiplier is offered for teaching, label it prominently and keep it separate from all physically reported quantities.

Do not begin with exact geometric collisions. They add weeks of complexity, impose difficult event/timestep constraints, and provide less useful gas-kinetic behavior than DSMC for this rarefied regime.

## References

1. G. A. Bird, “Direct Simulation and the Boltzmann Equation,” *Physics of Fluids* 13, 2676 (1970), DOI: [10.1063/1.1692849](https://doi.org/10.1063/1.1692849).
2. Sandia National Laboratories, [SPARTA: Stochastic PArallel Rarefied-gas Time-accurate Analyzer](https://www.sandia.gov/ccr/software/sparta/).
3. SPARTA documentation, [collision models and per-cell particle sorting](https://sparta-docs.readthedocs.io/en/docs/collide.html).
4. B. D. Lubachevsky, “How to Simulate Billiards and Similar Systems,” *Journal of Computational Physics* 94, 255–283 (1991), DOI: [10.1016/0021-9991(91)90222-7](https://doi.org/10.1016/0021-9991(91)90222-7).
5. NIST/JANAF transport-property compilation, [Lennard-Jones parameters including Argon](https://srd.nist.gov/JPCRD/jpcrd329.pdf). The representative Argon diameter used in the estimates is 3.542 Å.
6. G. A. Bird, [“Direct simulation of high-vorticity gas flows”](https://ntrs.nasa.gov/citations/19870044283), NASA Technical Reports Server (1987), discussing DSMC cell-size requirements relative to mean free path.

The numerical estimates in this document are derived from the current application constants and controls, not benchmark measurements. Runtime claims should be confirmed with an in-browser benchmark during implementation.
