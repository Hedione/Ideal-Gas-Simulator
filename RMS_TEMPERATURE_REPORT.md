# Why the RMS-speed preset briefly heats the gas

Assessment date: November 4, 2026.

## Finding

The temperature rise after selecting **RMS SPEED** is physically expected when diffuse thermal walls are enabled. The preset preserves the gas's kinetic energy at the instant of selection, but it creates a nonequilibrium speed distribution. The walls can then supply heat even when the initial kinetic temperature equals the wall temperature.

The suggested explanation is substantially right: an incoming molecule from this uniform-speed ensemble gains energy in about 56% of fully diffuse contacts with an equal-temperature wall. More decisively, the **mean** outgoing energy exceeds the incoming energy. After the speed distribution relaxes, energy exchange balances and the measured temperature returns toward the wall temperature.

No physics change was needed to remove this transient. Three regression tests now protect its energy balance, thermal-wall sampling, and eventual relaxation. The independent numerical check below also reproduces the rise using exact collision times rather than the application's timestep wall handling.

This conclusion assumes the wall bath is enabled and has nonzero diffuse probability. With the bath off, or with 0% diffuse reflection, the RMS preset must not produce systematic heating. Elastic DSMC collisions redistribute energy but cannot supply it.

## What the preset does

`GasSimulation.setUniformRmsSpeed()` in [src/physics.ts](src/physics.ts) sets every speed to the **pre-click ensemble RMS speed**, while retaining directions and total kinetic energy within floating-point precision. It preserves positions and resets experiment counters and elapsed time.

The displayed kinetic temperature is

$$
T_{\mathrm{kin}}=\frac{m\langle v^2\rangle}{3k_B}.
$$

Consequently, the preset does not change that number immediately. However, identical values of $\langle v^2\rangle$ do not imply identical distributions: a thin shell at one speed is different from a Maxwell–Boltzmann gas. Outside equilibrium, this second-moment temperature alone does not determine the direction of heat flow.

Let the kinetic temperature immediately after the preset be $T_0$. Every incident particle initially has energy

$$
E_{\mathrm{in}}=\tfrac12 m v_{\mathrm{rms}}^2=\tfrac32 k_B T_0.
$$

The RMS speed comes from the actual ensemble, so $T_0$ can differ slightly from the selected wall temperature $T_w$.

## Why a thermal wall emits more energetic particles

A sample of **wall-crossing events** differs from a sample of particles occupying the box: particles with a larger normal speed cross a wall more frequently. The diffuse boundary condition must account for this flux weighting.

For a stationary wall, the two outgoing tangential velocity components are Gaussian with variance $k_B T_w/m$. The inward normal speed follows

$$
p(v_n)=\frac{m}{k_B T_w}v_n
\exp\!\left(-\frac{m v_n^2}{2k_B T_w}\right),\qquad v_n>0.
$$

This is a Rayleigh law. The application's `thermalWallNormalSpeed()` implements it. LAMMPS independently uses Gaussian tangential components and a Rayleigh normal component for diffuse reflection in its [reference implementation](https://github.com/lammps/lammps/blob/develop/src/EXTRA-FIX/fix_wall_reflect_stochastic.cpp). Its [boundary-condition documentation](https://docs.lammps.org/fix_wall_reflect_stochastic.html) also distinguishes heat-exchanging diffuse reflection from energy-preserving specular reflection.

Each tangential component carries mean energy $\tfrac12 k_B T_w$; the flux-weighted normal component carries $k_B T_w$. Therefore,

$$
\langle E_{\mathrm{out}}\rangle=2k_B T_w,
\qquad
\langle\Delta E\rangle=2k_B T_w-\tfrac32 k_B T_0.
$$

When $T_0=T_w$, the first diffuse contacts gain **$\tfrac12 k_B T_w$ per molecule on average**. This is energy delivered by the thermal reservoir, not energy created by elastic molecular collisions or by the preset.

There is no contradiction with equilibrium. For an equilibrium Maxwellian gas, the incident wall-event sample is also flux weighted and carries mean energy $2k_B T_w$. Incoming and outgoing energy fluxes then balance. Molecules counted in the volume still have mean energy $\tfrac32 k_B T_w$: slower particles spend longer in the box between wall contacts.

Replacing the Rayleigh normal law with a half-Gaussian would give the wrong emitted flux and introduce artificial cooling. Holding the measured temperature fixed by rescaling velocities would also change the physical experiment.

## How often does a molecule gain energy?

For diffuse emission in three dimensions, the outgoing kinetic energy has density

$$
p(E)=\frac{E}{(k_B T_w)^2}\exp\!\left(-\frac{E}{k_B T_w}\right).
$$

Thus, for the initial equal-temperature RMS shell,

$$
P(E_{\mathrm{out}}>\tfrac32 k_B T_w)
=e^{-3/2}(1+\tfrac32)\approx0.5578.
$$

Approximately **55.8% gain energy and 44.2% lose energy** in their first diffuse contact. Both the gain probability and the mean change support the explanation, but it is the mean energy transfer that determines heating. These expressions are derived here from the wall distribution, rather than quoted measurements from an external source.

## Why the rise later reverses

Thermal contacts broaden the initially narrow speed shell. Faster particles reach walls more frequently and are preferentially resampled; slower particles remain in the volume longer. These effects restore the Maxwellian occupancy distribution and remove the excess transient energy. DSMC adds energy-conserving redistribution and changes the transient's size and duration.

Equal wall and initial kinetic temperatures therefore do not require a monotonic temperature curve for this deliberately prepared nonequilibrium state. The overshoot is not a universal 33% increase of the whole gas: $2k_B T_w$ describes the mean energy of emitted **events**, not the mean energy of every molecule occupying the box.

For uniform positions and isotropic directions, the initial wall-contact rate per particle in a cube is $3v_{\mathrm{rms}}/(2L)$. At $T_0=T_w$, this gives

$$
\left.\frac{dT_{\mathrm{kin}}}{dt}\right|_{0^+}
=\frac{v_{\mathrm{rms}}T_w}{2L}.
$$

For 300 K argon in a 100 nm box, $v_{\mathrm{rms}}\approx433$ m/s, giving about **0.65 K/ps** initially. A substantial visible rise is therefore plausible on this simulator's timescale.

## Why the readout may look flat and then jump

The preset immediately preserves the measured temperature. Subsequent changes require wall contacts, whose timing depends on the existing positions and directions.

With a uniformly populated box, some molecules are already close to a wall, so there is **no required macroscopic waiting period** before heating begins. A strict long plateau is not predicted merely by selecting RMS SPEED. A specially prepared population away from the walls could, however, have a finite first-contact delay.

The displayed statistics in [src/App.tsx](src/App.tsx) refresh every 160 ms; they do not show every physics step. At 1× playback, this corresponds to roughly 16 ps of physical evolution per readout update. The initial estimate above permits roughly 10 K between successive updates. That sampling can make continuous heating look like a brief pause followed by a jump. Larger time multipliers make this more pronounced; pausing and resuming can also affect the perceived timing.

## Numerical checks

The following seeded runs used the project's numerical model: **16,000 argon particles, 300 K wall target, 100 nm box side, all six walls eligible, 100% diffuse reflection when enabled, no Brownian tracer, and initial random seed 4001**. The initial sampled kinetic temperature was 300.427 K. This count differs from the application's 25,000-particle default; with DSMC on, it also changes the density and relaxation rate.

Temperature was sampled every 10 ps over 1,000 ps. The final column averages samples from 800 through 1,000 ps. Peak times are resolved only to that 10 ps sampling interval.

| Preparation and dynamics | Timestep | Peak temperature | Peak time | Late mean temperature |
| --- | --- | --- | --- | --- |
| RMS; bath off; DSMC off | 2 ps | 300.427 K | Constant | 300.427 K |
| RMS; bath off; DSMC on | 2 ps | 300.427 K | Constant | 300.427 K |
| RMS; bath on; DSMC off | 2 ps | 349.824 K | 150 ps | 299.726 K |
| RMS; bath on; DSMC off | 0.5 ps | 348.469 K | 140 ps | 300.513 K |
| RMS; bath on; DSMC on | 2 ps | 341.636 K | 140 ps | 303.585 K |
| Maxwellian; bath on; DSMC off | 2 ps | 303.363 K | 870 ps | 300.770 K |
| RMS; independent collision-time reference; DSMC off | Exact wall hits | 350.336 K | 150 ps | 300.831 K |

The independent reference used double-precision positions and velocities, the same initial particle ensemble, and a separate random stream with seed 91001. It advanced each particle to the earliest wall hit, sampled the diffuse outgoing velocity there, then advanced through the remaining time, including any further hits. It did not use `advanceParticles()` or its coordinate-folding logic. This is an independent implementation of the same boundary model, not experimental validation of a real gas–surface interaction.

The thermal-wall rise survives a fourfold reduction in the application's timestep and also appears with exact wall-hit timing. The collisionless peak is roughly 16% above its initial temperature, while the Maxwellian control stays close to equilibrium. Bath-off energy remains constant with or without DSMC. These checks support the transient as a physical consequence of this model rather than a preset energy-injection bug.

The DSMC run is still slightly warm over the late averaging window; a finite observation window does not establish its asymptotic temperature. At 1,000 ps it measured 301.965 K. Individual finite-ensemble fluctuations are expected: at Maxwellian equilibrium, the standard deviation of kinetic temperature is approximately $T\sqrt{2/(3N)}$, or 1.94 K for this particle count. The correlated late samples are not independent uncertainty estimates.

### Reproducible regression coverage

Run `npm test -- --run`. [src/physics.test.ts](src/physics.test.ts) now checks:

- RMS-preset energy conservation during subsequent bath-off dynamics, with DSMC both disabled and enabled.
- Mean diffuse-emission energy $2k_B T_w$, approximately 55.8% energy-gain probability for an incident RMS shell, and inward emission.
- A seeded RMS shell that heats transiently and subsequently returns close to the bath temperature.

The larger exploratory runs and the independent reference were temporary analysis tools. The regression tests are retained in the repository; their statistical tolerances are intentionally broader than the individual measured values above.

## Limits and decision

The application approximates wall collisions within finite timesteps. Its emitted **velocity law** is correct, but it folds the proposed position and applies thermal resampling within the substep rather than propagating every diffuse event at its exact collision time. DSMC is itself a statistical dilute-gas approximation. Very large steps, high playback multipliers, and the existing 64-substep cap can add numerical error. The checks above validate the existence and approximate scale of this transient under the stated settings, not every possible control combination.

The physical interpretation is limited to a classical, fully accommodating diffuse-wall model; real surfaces can have different accommodation behavior. The current controls already allow reduced diffuse probability or a disabled bath to explore alternatives.

**Decision:** retain the RMS preset and existing thermal-wall physics. The preset preserves initial energy correctly, the boundary law is appropriate for this model, and the observed temporary heating is reproduced independently. Suppressing the rise would make this experiment less physically faithful.
