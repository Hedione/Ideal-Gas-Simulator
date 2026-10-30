# Cold-Particle Turnover with the Wall-Only Thermal Bath

## Current behavior

The thermal bath is a boundary reservoir. Particles can receive random momentum and energy changes **only when they contact an eligible wall**:

- normal bath mode: all six faces are thermal;
- **Restrict bath to +X**: only the highlighted +X face is thermal;
- interior free flight: no bath perturbation is possible.

The cold-particle focus is purely diagnostic. It highlights particles whose instantaneous scalar speed is below the selected cutoff. It neither creates particles nor changes their velocities.

## 1. What happens at a wall

At each eligible wall contact, the accommodation probability is

\[
\alpha=1-\exp(-\nu\times1\ \mathrm{ns}),
\]

where \(\nu\) is the wall-coupling control.

With probability \(1-\alpha\), reflection is specular: the normal component reverses, tangential components remain unchanged, and scalar speed is conserved.

With probability \(\alpha\), the wall thermally re-emits the particle. The two tangential velocity components are Gaussian samples at the target temperature. The inward normal speed follows the flux-weighted Rayleigh law

\[
v_n=\sqrt{\frac{k_B T}{m}}\sqrt{-2\ln U},
\qquad U\sim\mathrm{Uniform}(0,1).
\]

This is a complete momentum exchange with the wall reservoir, not a small additive positive kick. A particle may gain or lose speed. For one accommodated contact,

\[
\Delta\mathbf p=m(\mathbf v_{\mathrm{out}}-\mathbf v_{\mathrm{in}})
\]

and

\[
\Delta E=\frac{m}{2}(v_{\mathrm{out}}^2-v_{\mathrm{in}}^2).
\]

The ideal wall reservoir conceptually receives the opposite momentum and energy.

## 2. Why highlighted cold particles still change

The cold classification is

\[
v<v_{\mathrm{cold\ cutoff}}.
\]

An accommodated wall contact draws a new thermal velocity, so a warm particle can become cold and a cold particle can become warm. The number of gas particles remains exactly constant; only membership in the highlighted subset changes.

At equilibrium, entries and exits balance on average. Individual identities change while the expected Maxwell–Boltzmann distribution remains stationary.

## 3. Approximate default turnover rate

For default Argon at 300 K,

\[
\sigma_v=\sqrt{\frac{k_B T}{m}}\approx249.9\ \mathrm{m/s}
\]

and the mean absolute value of one velocity component is

\[
\langle|v_x|\rangle=\sqrt{\frac{2}{\pi}}\sigma_v\approx199.4\ \mathrm{m/s}.
\]

The mean total wall-contact rate per particle in a cube is approximately

\[
r_{\mathrm{wall}}=
\frac{\langle|v_x|+|v_y|+|v_z|\rangle}{L}
\approx5.98\times10^8\ \mathrm{s^{-1}}.
\]

At 0.03×, one wall-clock second advances about 0.6 ns, giving approximately 0.359 wall contacts per particle per displayed second. Across 30,000 particles, that is about 10,800 wall contacts per displayed second.

At the default \(\nu=0.20\ \mathrm{ns^{-1}}\),

\[
\alpha=1-e^{-0.2}\approx0.181.
\]

The expected number of accommodated contacts is therefore roughly 1,950 per displayed second when all six walls are active. This is lower than the former volume-wide thermostat rate because particles now exchange heat only at boundaries.

For equilibrium Argon at 300 K:

| Cold cutoff | Equilibrium cold fraction | Mean cold count at N = 30,000 | Approximate membership changes per displayed second |
|---:|---:|---:|---:|
| 100 m/s | 1.63% | 488 | ~62 |
| 200 m/s | 11.29% | 3,388 | ~391 |

Half of these changes are entries and half are exits on average. The figures are analytical estimates; actual values fluctuate with finite sampling, frame timing, DSMC collisions, and the evolving temperature.

With +X-only contact, an isotropic gas reaches that one face at roughly one-sixth of the all-face contact rate, so wall-driven cold turnover should also be approximately six times slower.

## 4. Behavior by mode

| Configuration | Can speed change in the interior? | Can speed change at a wall? |
|---|---|---|
| Bath off, DSMC off | No | No; reflection is specular. |
| Six-face bath on, DSMC off | No | Yes, through accommodation at any face. |
| +X-only bath on, DSMC off | No | Yes, but only at the +X face. |
| Bath off, DSMC on | Yes, during a particle collision | No; walls remain specular. |
| Six-face bath on, DSMC on | Yes, during DSMC collisions | Yes, at any face. |
| +X-only bath on, DSMC on | Yes, during DSMC collisions | Yes, only at +X. |

DSMC collisions are different from wall heating. They conserve pair momentum and kinetic energy but redistribute both between collision partners. A particle can therefore cross the cold cutoff after a DSMC collision even with the bath disabled.

## 5. What changed from the earlier bath model

The former implementation used a spatially uniform Andersen thermostat. It could replace a velocity anywhere inside the box with probability \(1-e^{-\nu\Delta t}\). That caused visibly frequent cold-group turnover throughout the volume.

That mechanism has been removed. The current implementation:

1. advances the particle ballistically;
2. detects wall crossings;
3. applies specular reflection;
4. optionally performs thermal accommodation only at eligible contacts;
5. directs the new normal velocity back into the box.

Bath-enabled motion is internally substepped at high playback speeds so ordinary updates resolve wall contacts without spanning many box crossings.

## 6. How to verify boundary-only behavior

### No perturbation in the interior

1. turn DSMC off;
2. enable the thermal bath;
3. use a slow time scale;
4. watch a highlighted particle between wall contacts.

Its color classification and speed should remain unchanged during free flight. A change may occur only when it reaches a wall.

### Compare all-face and +X-only contact

1. enable cold focus;
2. keep DSMC off;
3. observe turnover with all six faces active;
4. enable **Restrict bath to +X**.

Turnover should become less frequent and localized to trajectories that reach the highlighted wall.

### Isolate DSMC changes

Turn the bath off and enable DSMC. Membership can still change after binary particle collisions, but total gas kinetic energy remains conserved apart from floating-point rounding.

## 7. Numerical and physical interpretation

The wall-coupling value has units of inverse nanoseconds in the interface, but it is converted to a per-contact accommodation probability using a one-nanosecond reference. It is therefore best interpreted as a convenient wall-coupling strength, not a volumetric Poisson event rate.

The flux-weighted normal distribution is essential. An ordinary half-Gaussian would over-represent slow outgoing particles because fast particles strike walls more frequently, producing artificial cooling. The current Rayleigh normal distribution preserves Maxwell–Boltzmann equilibrium when gas and wall temperatures match.

## Conclusion

The bath no longer applies random momentum changes in the box interior. Thermal perturbations occur only through wall contact—at all six faces normally or only at +X when restricted. Cold-particle generation and extinction remain visible because accommodated wall contacts replace velocities with thermal samples, but the effect is now a boundary heat-exchange process. Any additional interior turnover with the bath off is caused by optional DSMC particle collisions, not by the wall reservoir.
