# Diffuse Reflection Probability

The diffuse reflection probability controls what happens when a particle contacts an enabled thermal wall. It is a direct, dimensionless probability expressed as a percentage; it is not a frequency and has no units of hertz.

- **0%:** every wall collision is specular. The normal velocity component reverses, the tangential components remain unchanged, and particle speed is conserved.
- **100%:** every eligible wall collision is diffusely reflected. The particle's velocity is completely resampled from the selected wall's thermal distribution.
- **Between 0% and 100%:** each eligible wall contact independently chooses diffuse thermal resampling with the selected probability. Contacts that are not diffusely reflected remain specular.

If the interface value is \(P_{\mathrm{diffuse}}\) percent, the probability used for one eligible contact is

\[
\alpha=\frac{P_{\mathrm{diffuse}}}{100}.
\]

For the uncommon case where a numerical substep contains \(N\) eligible contacts, the combined probability of at least one diffuse event is

\[
P(\text{at least one diffuse event})=1-(1-\alpha)^N.
\]

Diffuse reflection is a boundary process. It cannot perturb a particle during interior free flight. When resampling occurs, the two tangential velocity components are Gaussian thermal samples and the inward normal speed uses the flux-weighted distribution required for Maxwell–Boltzmann equilibrium. The actual number of diffuse events per second therefore depends on both the selected probability and the rate at which particles reach enabled walls.
