# Theory and Numerical Model

This document describes the physical theory and numerical model implemented by the Maxwell–Boltzmann Lab. It distinguishes physics simulated directly from analytical overlays and visual aids.

## 1. Scope and assumptions

The system is a classical, nonrelativistic, monatomic ideal gas in a cubic box of side length

\[
L=1\ \mu\mathrm{m}=10^{-6}\ \mathrm{m},
\]

so its volume is \(V=L^3=10^{-18}\ \mathrm{m^3}\). Each particle has position \(\mathbf{x}_i\), velocity \(\mathbf{v}_i\), and mass \(m\). Calculations use SI units. Masses entered in atomic mass units are converted with

\[
1\ \mathrm{u}=1.66053906660\times10^{-27}\ \mathrm{kg},
\]

and the exact SI Boltzmann constant is

\[
k_B=1.380649\times10^{-23}\ \mathrm{J\,K^{-1}}.
\]

The model assumes:

- point-like particles with no excluded volume;
- no continuous intermolecular forces; particle collisions are either disabled or represented statistically by optional hard-sphere DSMC;
- force-free Newtonian motion between wall contacts;
- rigid, specularly reflecting ordinary walls;
- three translational degrees of freedom per particle;
- one species and one mass at a time;
- no quantum, relativistic, gravitational, or chemical effects.

Nitrogen uses the molecular mass of N₂, but each molecule remains a point particle with translational motion only. Rotational and vibrational heat capacities are not included.

## 2. Maxwell–Boltzmann equilibrium

### 2.1 Velocity components

For an ideal gas in equilibrium at temperature \(T\), each Cartesian component is an independent Gaussian:

\[
v_x,v_y,v_z\sim\mathcal N(0,\sigma^2),
\qquad \sigma^2=\frac{k_B T}{m}.
\]

The code samples these components with a Box–Muller transform. The three-dimensional velocity density is

\[
p(\mathbf v)=
\left(\frac{m}{2\pi k_B T}\right)^{3/2}
\exp\left(-\frac{m\lVert\mathbf v\rVert^2}{2k_B T}\right).
\]

This vector distribution is distinct from the scalar-speed distribution shown in the chart.

### 2.2 Scalar speed

The speed is

\[
v=\lVert\mathbf v\rVert=\sqrt{v_x^2+v_y^2+v_z^2}.
\]

Integrating the velocity density over spherical shells produces

\[
f(v)=4\pi
\left(\frac{m}{2\pi k_B T}\right)^{3/2}
v^2\exp\left(-\frac{mv^2}{2k_B T}\right),
\qquad v\ge0,
\]

with \(\int_0^\infty f(v)\,dv=1\). The characteristic speeds are

\[
v_{\mathrm{mp}}=\sqrt{\frac{2k_B T}{m}},
\qquad
\bar v=\sqrt{\frac{8k_B T}{\pi m}},
\qquad
v_{\mathrm{rms}}=\sqrt{\frac{3k_B T}{m}}.
\]

They all scale as \(\sqrt{T/m}\). Raising temperature shifts and broadens the distribution; raising mass at fixed temperature shifts it toward lower speeds.

## 3. Initialization

Positions are sampled independently and uniformly throughout the cube. Velocities are sampled independently from the Gaussian component law above. The initial ensemble is therefore already an equilibrium Maxwell–Boltzmann sample, subject to finite-population fluctuations.

Changing the particle-population slider does not restart the ensemble. When the count decreases, a uniformly random subset is retained with its positions, velocities, speeds, and event counters unchanged. When the count increases, existing particles remain unchanged; each added particle receives a uniform random position and three independent Gaussian velocity components at the current target temperature. Consequently, each added scalar speed follows the Maxwell–Boltzmann distribution. Elapsed simulation time and accumulated global collision history are preserved, while the DSMC spatial index is rebuilt for the new population on the next collision step.

Elastic walls do not create this equilibrium. With both the thermal bath and DSMC disabled, a nonequilibrium collisionless velocity distribution remains nonequilibrium. Enabling DSMC permits particles to exchange momentum and energy through conservative binary collisions and therefore permits collisional relaxation.

## 4. Free flight and numerical coordinates

Between wall contacts, each particle follows exact force-free motion:

\[
\mathbf x_i(t+\Delta t)=\mathbf x_i(t)+\mathbf v_i\Delta t.
\]

Positions are stored in normalized coordinates \([0,1]^3\). Physical displacement is divided by \(L\):

\[
x_{\mathrm{norm}}(t+\Delta t)
=x_{\mathrm{norm}}(t)+\frac{v_x\Delta t}{L}.
\]

Since acceleration is zero, no approximate force integrator is needed. Discretization affects stochastic bath timing and the precise location of a thermal-wall event within a frame, not the free-flight trajectory itself.

## 5. Elastic wall collisions

At an ordinary wall, the normal velocity reverses while tangential components remain unchanged. For an x-normal wall,

\[
(v_x,v_y,v_z)\longrightarrow(-v_x,v_y,v_z).
\]

Thus \(v_{\mathrm{after}}^2=v_{\mathrm{before}}^2\), and kinetic energy is conserved apart from floating-point roundoff.

### 5.1 Multiple reflections in one update

The code does not clamp escaped particles to a boundary. It treats the path as motion through mirrored copies of the box and folds the result back into \([0,1]\) with a triangle-wave mapping. Even if one update spans several box lengths, the particle remains bounded and its velocity receives the correct parity of sign reversals.

### 5.2 Momentum transfer

For a specular collision with outward normal \(\hat{\mathbf n}\), the particle momentum change is

\[
\Delta\mathbf p_{\mathrm{particle}}
=-2m(\mathbf v\cdot\hat{\mathbf n})\hat{\mathbf n}.
\]

The wall receives the equal and opposite impulse. Macroscopic pressure is the time-averaged normal momentum transfer per unit area and time. At equilibrium,

\[
P=\frac{Nk_B T}{V}.
\]

The application performs the velocity reflection that represents this momentum exchange, but it does not accumulate impulses into a measured-pressure observable. A pressure computed from the ideal-gas law would be an analytical prediction rather than a directly sampled value.

## 6. Particle–particle collision models

The application provides two distinct modes.

### 6.1 Collisionless ideal gas

With DSMC disabled, particles can pass through the same visual point without interacting. They do not exchange momentum or energy, each particle retains its speed between thermostat events, and a nonequilibrium velocity law cannot self-equilibrate. The luminous point size is graphical and is not a collision radius.

### 6.2 Spatial hard-sphere DSMC

With **DSMC collisions** enabled, particles are counting-sorted into an adaptive Cartesian grid containing roughly 40–100 particles per cell. Candidate pairs are selected only within the same cell using a No-Time-Counter-style hard-sphere probability. For collision diameter \(d\), cross section \(\sigma_T=\pi d^2\), cell volume \(V_c\), cell population \(N_c\), and relative-speed bound \(g_{\max}\), the expected number of pair trials in a collision step is

\[
M_c=\frac{N_c(N_c-1)}{2}\frac{\sigma_Tg_{\max}\Delta t}{V_c}.
\]

A candidate with relative speed \(g_{ij}\) is accepted with probability \(g_{ij}/g_{\max}\). For an accepted equal-mass pair,

\[
\mathbf V=\frac{\mathbf v_i+\mathbf v_j}{2},
\qquad
\mathbf g=\mathbf v_i-\mathbf v_j.
\]

The relative velocity is rotated to an isotropically random direction while preserving \(|\mathbf g|\), then

\[
\mathbf v_i'=\mathbf V+\frac{\mathbf g'}{2},
\qquad
\mathbf v_j'=\mathbf V-\frac{\mathbf g'}{2}.
\]

Every accepted collision conserves pair momentum and kinetic energy to Float32 rounding precision. Unlike exact event-driven billiards, DSMC reproduces dilute-gas collision statistics without requiring rendered particles to touch.

The engine uses internal collision substeps based on cell width and thermal speed. If the 64-substep or per-cell trial safety cap is reached, the interface displays an accuracy warning rather than silently presenting the result as fully resolved.

The hard-sphere mean free path reported by the interface is

\[
\lambda=\frac{1}{\sqrt{2}\,n\pi d^2},
\]

and the Knudsen number is \(\mathrm{Kn}=\lambda/L\). The current species diameters are representative transport parameters; custom mass and collision diameter remain independently editable.

## 7. Thermal contact

The target temperature belongs to an idealized external reservoir. Thermostat events exchange energy and momentum with that reservoir, so gas energy and gas momentum are not conserved while a bath is active.

### 7.1 Six-face thermal reservoir

With **Thermal bath** on and the +X restriction off, all six box faces are diffuse thermal reservoirs. Particles retain their velocities during interior free flight. A random thermal perturbation is possible only after a detected wall crossing.

The selected wall-coupling rate becomes a per-contact accommodation probability using a one-nanosecond reference interval:

\[
\alpha=1-\exp(-\nu\times1\ \mathrm{ns}).
\]

With probability \(1-\alpha\), contact remains specular and speed is conserved. With probability \(\alpha\), the particle is thermally re-emitted: its inward normal speed follows the flux-weighted wall distribution and its two tangential components are Gaussian samples at the target temperature.

When one numerical substep spans more than one wall crossing, the code combines the eligible contacts as

\[
P_{\mathrm{accommodate}}=1-\exp(-\nu\times1\ \mathrm{ns}\times N_{\mathrm{contacts}}).
\]

Bath-enabled motion is internally substepped according to thermal speed and box size to make multiple-contact approximations uncommon during ordinary operation.

### 7.2 +X-only thermal reservoir

With **Restrict bath to +X** on, only crossings of the +X wall are eligible for thermal accommodation. The active wall is shown as a faint amber plane. The other five walls remain perfectly specular.

The same per-contact accommodation probability is used. An accommodated particle's x velocity points into the box, while its y and z components are equilibrium Gaussian samples.

### 7.3 Flux-weighted thermal-wall sampling

Fast particles in the wall-normal direction strike a wall more frequently. The incident population is therefore weighted by \(|v_n|\). If outgoing normal speed were sampled as an ordinary half-Gaussian, fast incident particles would be replaced too often by slower ones and the gas would cool spuriously.

For a diffuse equilibrium thermal wall, the outgoing normal-speed density is instead

\[
p(v_n)=\frac{v_n}{\sigma^2}
\exp\left(-\frac{v_n^2}{2\sigma^2}\right),
\qquad v_n>0,
\]

where \(\sigma=\sqrt{k_B T/m}\). This is a Rayleigh distribution. Inverse-transform sampling gives

\[
v_n=\sigma\sqrt{-2\ln U},
\qquad U\sim\mathrm{Uniform}(0,1).
\]

For the +X wall, the code assigns \(v_x=-v_n\), so the particle moves back into the box. Tangential components remain

\[
v_y,v_z\sim\mathcal N(0,\sigma^2).
\]

Flux-weighted emission is required for a gas already at the reservoir temperature to remain stationary under repeated thermal-wall contacts.

### 7.4 Reservoir energy and momentum exchange

For a thermalized particle,

\[
\Delta E=\frac{m}{2}
\left(v_{\mathrm{out}}^2-v_{\mathrm{in}}^2\right),
\]

and

\[
\Delta\mathbf p=m
(\mathbf v_{\mathrm{out}}-\mathbf v_{\mathrm{in}}).
\]

The ideal reservoir receives the opposite energy and momentum. These exchanges are implicit in velocity resampling; the application does not currently integrate them into heat-flux or wall-force readouts.

## 8. Changing temperature

Changing the temperature changes the reservoir target without redrawing the current velocities. Later accommodated wall contacts gradually replace velocities with samples associated with the new target. This preserves a physically meaningful nonequilibrium relaxation process.

Relaxation is caused by explicit reservoir coupling, not by particle–particle equilibration. It is mediated by contacts with all six walls by default and is slower when restricted to the +X face. No bath perturbation occurs in the interior.

## 9. Kinetic temperature and equipartition

For three translational degrees of freedom and negligible bulk flow,

\[
\langle K\rangle
=\frac{1}{2}m\langle v^2\rangle
=\frac{3}{2}k_B T.
\]

The displayed measured temperature is computed from actual velocities:

\[
T_{\mathrm{measured}}
=\frac{m\langle v^2\rangle}{3k_B}.
\]

The implementation assumes zero mean flow and does not subtract the measured center-of-mass velocity. Initial bulk flow is statistically close to zero but not constrained to be exactly zero. Its contribution is negligible at the default large populations.

Finite ensembles fluctuate around theoretical values. Relative fluctuations decrease as the population grows, explaining why 50,000 particles produce a smoother instantaneous histogram than 100.

## 10. Histogram and analytical curve

If bin \(j\) contains \(n_j\) particles and has width \(\Delta v\), its probability density is

\[
h_j=\frac{n_j}{N\Delta v}.
\]

Therefore \(\sum_jh_j\Delta v\approx1\) when the displayed interval includes essentially all speeds. The range is

\[
v_{\max}=5\sqrt{\frac{k_B T}{m}},
\]

which contains nearly all of the theoretical distribution. The histogram uses every simulated particle and updates independently of rendering.

Hot/cold cutoffs, the speed-band window, and their dashed chart markers are diagnostics only. They change point colors and sizes but do not modify velocities, thermostat behavior, temperature, or histogram normalization.

## 11. Physical time and rendering time

Micrometer-scale molecular motion occurs over nanoseconds. The renderer maps wall-clock time to physical time using

\[
\Delta t_{\mathrm{physical}}
=\Delta t_{\mathrm{wall}}(20\ \mathrm{ns/s})s,
\]

where \(s\) is the time-scale control. At the default \(s=0.01\), one wall-clock second advances about \(0.2\ \mathrm{ns}\) of physical time. This affects playback rate, not the physical equations or equilibrium distribution.

Wall-frame intervals are capped at 0.05 seconds so a suspended browser tab cannot cause an unexpectedly huge update. The reflection algorithm still supports multiple crossings in one update.

## 12. Rendering model

Positions, velocities, speeds, and colors use contiguous typed arrays. Three.js renders all particles through one `Points` object backed by `BufferGeometry`, rather than individual meshes. Markers are enlarged and luminous for visibility and are not drawn at literal molecular scale. Marker size is controlled by an independent visual slider and decreases automatically with the square root of the particle population. Collision diameter affects DSMC cross sections and mean free paths but no longer affects marker size.

The transparent cube, camera, grid, glow, hot/cold focus, and thermal-face overlay are visual instruments. They do not feed back into the simulation.

Single-particle tracking is also observational. A random particle receives a separate marker and short trajectory trail while the other particles are visually desaturated. The camera remains centered on the box, so tracking does not alter the user's orbital frame of reference. Per-particle integer counters distinguish ordinary wall reflections, accommodated thermal-wall contacts, and accepted DSMC binary collisions. Reading or displaying those counters does not alter collision probabilities or velocities.

The optional momentum-space view places every particle at

\[
\mathbf p=m\mathbf v.
\]

For display, each component is divided by (5p_\sigma), where (p_\sigma=\sqrt{mk_B T}). The wireframe cube therefore spans \(\pm5p_\sigma\) on each axis and contains nearly all equilibrium component samples. This normalization changes only the visualization; the overlay reports the corresponding physical boundary in kg·m/s. The momentum cloud uses one GPU point cloud, refreshes its data at about 15 Hz, and has independent orbit controls. It is disabled by default so it contributes no rendering cost until enabled.

## 13. Capabilities and limitations

The model correctly demonstrates:

- the Maxwell–Boltzmann speed law;
- \(\sqrt{T}\) and \(1/\sqrt m\) speed scaling;
- translational equipartition;
- finite-sample fluctuations;
- energy-conserving specular reflection;
- stochastic reservoir-driven relaxation;
- equilibrium-preserving emission from one diffuse thermal wall;
- conservative hard-sphere DSMC relaxation and mean-free-path scaling.

It does not model:

- continuous intermolecular forces or exact geometric contact trajectories;
- validated continuum hydrodynamics, viscosity coefficients, or a resolved Knudsen layer;
- VHS/VSS temperature-dependent transport cross sections;
- intermolecular potential energy or phase transitions;
- quantum statistics;
- rotation, vibration, chemistry, ionization, or radiation;
- deformable walls or wall inertia;
- direct pressure, heat-flux, or momentum-flux accumulation.

In collisionless mode, one-face heating does not establish a conventional local thermodynamic temperature field because particles do not redistribute energy through molecular encounters. With DSMC enabled, binary collisions provide a statistical transport mechanism, so one-face heating can produce collisional relaxation and spatial energy transport within the resolution limits of the collision grid.

## 14. Validation

Automated tests verify:

- Gaussian component means and variances;
- \(\langle v^2\rangle=3k_B T/m\);
- theoretical mean speed;
- histogram and analytical-density normalization;
- temperature and mass scaling;
- kinetic-energy conservation under elastic reflection;
- six-face thermal-wall relaxation and absence of interior bath events;
- single-face contact eligibility and inward emission;
- absence of thermal-wall cooling bias;
- DSMC pair momentum and kinetic-energy conservation;
- DSMC isotropization of a two-stream nonequilibrium ensemble;
- hard-sphere mean-free-path and Knudsen diagnostics;
- finite, bounded particle buffers after extreme updates.

See [`src/physics.ts`](src/physics.ts) for the implementation and [`src/physics.test.ts`](src/physics.test.ts) for executable checks.
