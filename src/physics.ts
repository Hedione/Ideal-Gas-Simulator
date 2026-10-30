export const BOLTZMANN = 1.380649e-23
export const ATOMIC_MASS_UNIT = 1.66053906660e-27
export const BOX_LENGTH_METERS = 1e-6

export const GAS_SPECIES = {
  Helium: 4.002602,
  Neon: 20.1797,
  Argon: 39.948,
  Nitrogen: 28.0134,
  Xenon: 131.293,
} as const

/** Representative Lennard–Jones/hard-sphere diameters in ångströms. */
export const COLLISION_DIAMETERS_ANGSTROM: Record<GasName, number> = {
  Helium: 2.551,
  Neon: 2.82,
  Argon: 3.542,
  Nitrogen: 3.798,
  Xenon: 4.1,
}

export type GasName = keyof typeof GAS_SPECIES
export type RandomSource = () => number

export interface SimulationStats {
  count: number
  measuredTemperature: number
  meanSpeed: number
  rmsSpeed: number
  meanKineticEnergy: number
  totalKineticEnergy: number
  elapsedTime: number
}

export interface Histogram {
  centers: number[]
  density: number[]
  binWidth: number
  maxSpeed: number
}

export interface CollisionDiagnostics {
  enabled: boolean
  gridDimension: number
  acceptedLastAdvance: number
  trialsLastAdvance: number
  totalAccepted: number
  measuredCollisionRate: number
  meanFreePath: number
  meanCollisionTime: number
  knudsenNumber: number
  accuracyLimited: boolean
}

/** Box–Muller transform: each Cartesian component is N(0, sigma²). */
export function gaussian(random: RandomSource = Math.random): number {
  let u = 0
  let v = 0
  while (u === 0) u = random()
  while (v === 0) v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Normal speed leaving a diffuse thermal wall. Incident particles are sampled
 * in proportion to their normal speed, so the emitted flux must follow the
 * Rayleigh law rather than an ordinary half-Gaussian to preserve equilibrium.
 */
function thermalWallNormalSpeed(sigma: number, random: RandomSource): number {
  let u = 0
  while (u === 0) u = random()
  return sigma * Math.sqrt(-2 * Math.log(u))
}

/** Isotropic, elastic, equal-mass binary scattering in the center-of-mass frame. */
export function scatterEqualMassVelocities(
  velocities: Float32Array,
  particleA: number,
  particleB: number,
  random: RandomSource = Math.random,
): void {
  const a = particleA * 3
  const b = particleB * 3
  const centerX = 0.5 * (velocities[a] + velocities[b])
  const centerY = 0.5 * (velocities[a + 1] + velocities[b + 1])
  const centerZ = 0.5 * (velocities[a + 2] + velocities[b + 2])
  const relativeX = velocities[a] - velocities[b]
  const relativeY = velocities[a + 1] - velocities[b + 1]
  const relativeZ = velocities[a + 2] - velocities[b + 2]
  const relativeSpeed = Math.hypot(relativeX, relativeY, relativeZ)
  if (relativeSpeed === 0) return

  const cosine = 1 - 2 * random()
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine))
  const azimuth = 2 * Math.PI * random()
  const scatteredX = relativeSpeed * sine * Math.cos(azimuth)
  const scatteredY = relativeSpeed * sine * Math.sin(azimuth)
  const scatteredZ = relativeSpeed * cosine

  velocities[a] = centerX + 0.5 * scatteredX
  velocities[a + 1] = centerY + 0.5 * scatteredY
  velocities[a + 2] = centerZ + 0.5 * scatteredZ
  velocities[b] = centerX - 0.5 * scatteredX
  velocities[b + 1] = centerY - 0.5 * scatteredY
  velocities[b + 2] = centerZ - 0.5 * scatteredZ
}

export function thermalSigma(temperature: number, massAmu: number): number {
  return Math.sqrt((BOLTZMANN * temperature) / (massAmu * ATOMIC_MASS_UNIT))
}

export function mostProbableSpeed(temperature: number, massAmu: number): number {
  return Math.sqrt(2) * thermalSigma(temperature, massAmu)
}

export function theoreticalMeanSpeed(temperature: number, massAmu: number): number {
  return Math.sqrt(8 / Math.PI) * thermalSigma(temperature, massAmu)
}

export function theoreticalRmsSpeed(temperature: number, massAmu: number): number {
  return Math.sqrt(3) * thermalSigma(temperature, massAmu)
}

export function maxwellBoltzmannDensity(
  speed: number,
  temperature: number,
  massAmu: number,
): number {
  if (speed < 0 || temperature <= 0 || massAmu <= 0) return 0
  const mass = massAmu * ATOMIC_MASS_UNIT
  const a = mass / (2 * Math.PI * BOLTZMANN * temperature)
  return 4 * Math.PI * Math.pow(a, 1.5) * speed * speed *
    Math.exp((-mass * speed * speed) / (2 * BOLTZMANN * temperature))
}

export function characteristicMaxSpeed(temperature: number, massAmu: number): number {
  // Five component standard deviations contains >99.998% of this speed law.
  return 5 * thermalSigma(temperature, massAmu)
}

export function buildHistogram(speeds: Float32Array, bins: number, maxSpeed: number): Histogram {
  const safeBins = Math.max(1, Math.floor(bins))
  const safeMax = Math.max(Number.EPSILON, maxSpeed)
  const counts = new Float64Array(safeBins)
  const binWidth = safeMax / safeBins
  for (let i = 0; i < speeds.length; i += 1) {
    const speed = speeds[i]
    const index = Math.floor(speed / binWidth)
    if (index >= 0 && index < safeBins) counts[index] += 1
  }
  const normalization = speeds.length * binWidth
  return {
    centers: Array.from({ length: safeBins }, (_, i) => (i + 0.5) * binWidth),
    density: Array.from(counts, (count) => count / normalization),
    binWidth,
    maxSpeed: safeMax,
  }
}

function foldCoordinate(position: number, velocity: number): [number, number] {
  const cell = Math.floor(position)
  const fraction = position - cell
  // Odd cells are mirrored. This remains correct after arbitrarily many crossings.
  if (((cell % 2) + 2) % 2 === 0) return [fraction, velocity]
  return [1 - fraction, -velocity]
}

interface AxisWallCrossings {
  total: number
  positiveCount: number
  lastPositive: boolean
  lastFraction: number
  lastPositiveFraction: number
}

function isPositivePhysicalFace(boundary: number): boolean {
  return ((boundary % 2) + 2) % 2 === 1
}

/** Summarizes wall crossings along one unfolded, mirrored-box coordinate. */
function axisWallCrossings(start: number, end: number): AxisWallCrossings {
  if (end === start) {
    return { total: 0, positiveCount: 0, lastPositive: false, lastFraction: -1, lastPositiveFraction: -1 }
  }

  const direction = end > start ? 1 : -1
  const firstBoundary = direction > 0 ? Math.floor(start) + 1 : Math.ceil(start) - 1
  const lastBoundary = direction > 0 ? Math.floor(end) : Math.ceil(end)
  const total = direction > 0
    ? Math.max(0, lastBoundary - firstBoundary + 1)
    : Math.max(0, firstBoundary - lastBoundary + 1)
  if (total === 0) {
    return { total: 0, positiveCount: 0, lastPositive: false, lastFraction: -1, lastPositiveFraction: -1 }
  }

  const firstIsPositive = isPositivePhysicalFace(firstBoundary)
  const positiveCount = Math.floor(total / 2) + (total % 2 === 1 && firstIsPositive ? 1 : 0)
  const lastPositive = isPositivePhysicalFace(lastBoundary)
  const lastFraction = (lastBoundary - start) / (end - start)
  let lastPositiveFraction = -1
  if (positiveCount > 0) {
    const lastPositiveBoundary = lastPositive ? lastBoundary : lastBoundary - direction
    lastPositiveFraction = (lastPositiveBoundary - start) / (end - start)
  }
  return { total, positiveCount, lastPositive, lastFraction, lastPositiveFraction }
}

export class GasSimulation {
  positions: Float32Array
  velocities: Float32Array
  speeds: Float32Array
  wallCollisionCounts: Uint32Array
  thermalAccommodationCounts: Uint32Array
  particleCollisionCounts: Uint32Array
  count: number
  massAmu: number
  targetTemperature: number
  elapsedTime = 0
  readonly collisionDiagnostics: CollisionDiagnostics = {
    enabled: false,
    gridDimension: 0,
    acceptedLastAdvance: 0,
    trialsLastAdvance: 0,
    totalAccepted: 0,
    measuredCollisionRate: 0,
    meanFreePath: Number.POSITIVE_INFINITY,
    meanCollisionTime: Number.POSITIVE_INFINITY,
    knudsenNumber: Number.POSITIVE_INFINITY,
    accuracyLimited: false,
  }

  private random: RandomSource
  private collisionGridDimension = 0
  private cellCounts = new Int32Array(0)
  private cellOffsets = new Int32Array(0)
  private cellCursors = new Int32Array(0)
  private cellParticleIndices = new Int32Array(0)
  private cellRelativeSpeedMax = new Float64Array(0)

  constructor(
    count: number,
    temperature: number,
    massAmu: number,
    random: RandomSource = Math.random,
  ) {
    this.count = count
    this.targetTemperature = temperature
    this.massAmu = massAmu
    this.random = random
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)
    this.speeds = new Float32Array(count)
    this.wallCollisionCounts = new Uint32Array(count)
    this.thermalAccommodationCounts = new Uint32Array(count)
    this.particleCollisionCounts = new Uint32Array(count)
    this.randomizePositions()
    this.resampleVelocities()
  }

  randomizePositions(): void {
    for (let i = 0; i < this.positions.length; i += 1) this.positions[i] = this.random()
  }

  resizeParticleCount(nextCount: number): void {
    const resizedCount = Math.max(1, Math.floor(Number.isFinite(nextCount) ? nextCount : this.count))
    if (resizedCount === this.count) return

    const oldCount = this.count
    const positions = new Float32Array(resizedCount * 3)
    const velocities = new Float32Array(resizedCount * 3)
    const speeds = new Float32Array(resizedCount)
    const wallCollisionCounts = new Uint32Array(resizedCount)
    const thermalAccommodationCounts = new Uint32Array(resizedCount)
    const particleCollisionCounts = new Uint32Array(resizedCount)

    if (resizedCount < oldCount) {
      // A partial Fisher–Yates shuffle selects a uniform random subset. Sorting
      // the selected indices keeps the surviving particles in their prior order.
      const candidates = new Uint32Array(oldCount)
      for (let particle = 0; particle < oldCount; particle += 1) candidates[particle] = particle
      for (let particle = 0; particle < resizedCount; particle += 1) {
        const selected = particle + Math.floor(this.random() * (oldCount - particle))
        const swap = candidates[particle]
        candidates[particle] = candidates[selected]
        candidates[selected] = swap
      }
      const survivors = candidates.subarray(0, resizedCount)
      survivors.sort()
      for (let particle = 0; particle < resizedCount; particle += 1) {
        const sourceParticle = survivors[particle]
        const source = sourceParticle * 3
        const target = particle * 3
        positions[target] = this.positions[source]
        positions[target + 1] = this.positions[source + 1]
        positions[target + 2] = this.positions[source + 2]
        velocities[target] = this.velocities[source]
        velocities[target + 1] = this.velocities[source + 1]
        velocities[target + 2] = this.velocities[source + 2]
        speeds[particle] = this.speeds[sourceParticle]
        wallCollisionCounts[particle] = this.wallCollisionCounts[sourceParticle]
        thermalAccommodationCounts[particle] = this.thermalAccommodationCounts[sourceParticle]
        particleCollisionCounts[particle] = this.particleCollisionCounts[sourceParticle]
      }
    } else {
      positions.set(this.positions)
      velocities.set(this.velocities)
      speeds.set(this.speeds)
      wallCollisionCounts.set(this.wallCollisionCounts)
      thermalAccommodationCounts.set(this.thermalAccommodationCounts)
      particleCollisionCounts.set(this.particleCollisionCounts)

      const sigma = thermalSigma(this.targetTemperature, this.massAmu)
      for (let particle = oldCount; particle < resizedCount; particle += 1) {
        const index = particle * 3
        positions[index] = this.random()
        positions[index + 1] = this.random()
        positions[index + 2] = this.random()
        const vx = gaussian(this.random) * sigma
        const vy = gaussian(this.random) * sigma
        const vz = gaussian(this.random) * sigma
        velocities[index] = vx
        velocities[index + 1] = vy
        velocities[index + 2] = vz
        speeds[particle] = Math.hypot(vx, vy, vz)
      }
    }

    this.count = resizedCount
    this.positions = positions
    this.velocities = velocities
    this.speeds = speeds
    this.wallCollisionCounts = wallCollisionCounts
    this.thermalAccommodationCounts = thermalAccommodationCounts
    this.particleCollisionCounts = particleCollisionCounts

    // Spatial collision buffers are rebuilt lazily on the next DSMC step.
    this.collisionGridDimension = 0
    this.cellCounts = new Int32Array(0)
    this.cellOffsets = new Int32Array(0)
    this.cellCursors = new Int32Array(0)
    this.cellParticleIndices = new Int32Array(0)
    this.cellRelativeSpeedMax = new Float64Array(0)
    this.collisionDiagnostics.gridDimension = 0
    this.collisionDiagnostics.acceptedLastAdvance = 0
    this.collisionDiagnostics.trialsLastAdvance = 0
    this.collisionDiagnostics.measuredCollisionRate = 0
    this.collisionDiagnostics.meanFreePath = Number.POSITIVE_INFINITY
    this.collisionDiagnostics.meanCollisionTime = Number.POSITIVE_INFINITY
    this.collisionDiagnostics.knudsenNumber = Number.POSITIVE_INFINITY
    this.collisionDiagnostics.accuracyLimited = false
  }

  resampleVelocities(temperature = this.targetTemperature): void {
    this.targetTemperature = temperature
    const sigma = thermalSigma(temperature, this.massAmu)
    for (let particle = 0; particle < this.count; particle += 1) {
      const index = particle * 3
      const vx = gaussian(this.random) * sigma
      const vy = gaussian(this.random) * sigma
      const vz = gaussian(this.random) * sigma
      this.velocities[index] = vx
      this.velocities[index + 1] = vy
      this.velocities[index + 2] = vz
      this.speeds[particle] = Math.hypot(vx, vy, vz)
    }
  }

  setMass(massAmu: number, resample = true): void {
    this.massAmu = massAmu
    if (resample) this.resampleVelocities()
  }

  reset(temperature = this.targetTemperature): void {
    this.elapsedTime = 0
    this.collisionDiagnostics.totalAccepted = 0
    this.collisionDiagnostics.acceptedLastAdvance = 0
    this.collisionDiagnostics.trialsLastAdvance = 0
    this.collisionDiagnostics.measuredCollisionRate = 0
    this.wallCollisionCounts.fill(0)
    this.thermalAccommodationCounts.fill(0)
    this.particleCollisionCounts.fill(0)
    this.randomizePositions()
    this.resampleVelocities(temperature)
  }

  advance(
    dt: number,
    thermostatRate = 0,
    singleFaceThermostat = false,
    dsmcEnabled = false,
    collisionDiameterMeters = COLLISION_DIAMETERS_ANGSTROM.Argon * 1e-10,
  ): void {
    if (!Number.isFinite(dt) || dt <= 0) return

    this.collisionDiagnostics.enabled = dsmcEnabled
    this.collisionDiagnostics.acceptedLastAdvance = 0
    this.collisionDiagnostics.trialsLastAdvance = 0
    this.collisionDiagnostics.measuredCollisionRate = 0
    this.collisionDiagnostics.accuracyLimited = false

    if (!dsmcEnabled || !Number.isFinite(collisionDiameterMeters) || collisionDiameterMeters <= 0) {
      const speedBound = Math.max(1, characteristicMaxSpeed(this.targetTemperature, this.massAmu))
      const maximumBathStep = (0.2 * BOX_LENGTH_METERS) / speedBound
      const requiredBathSubsteps = thermostatRate > 0 ? Math.max(1, Math.ceil(dt / maximumBathStep)) : 1
      const bathSubsteps = Math.min(64, requiredBathSubsteps)
      const bathStep = dt / bathSubsteps
      for (let step = 0; step < bathSubsteps; step += 1) {
        this.advanceParticles(bathStep, thermostatRate, singleFaceThermostat)
      }
      this.elapsedTime += dt
      return
    }

    const gridDimension = Math.max(1, Math.min(16, Math.round(Math.cbrt(this.count / 64))))
    this.ensureCollisionBuffers(gridDimension)
    this.updateCollisionScales(collisionDiameterMeters)

    const cellWidth = BOX_LENGTH_METERS / gridDimension
    const speedBound = Math.max(1, characteristicMaxSpeed(this.targetTemperature, this.massAmu))
    const maximumStep = (0.5 * cellWidth) / speedBound
    const requiredSubsteps = Math.max(1, Math.ceil(dt / maximumStep))
    const substeps = Math.min(64, requiredSubsteps)
    const substepDt = dt / substeps
    if (requiredSubsteps > substeps) this.collisionDiagnostics.accuracyLimited = true

    let accepted = 0
    let trials = 0
    for (let step = 0; step < substeps; step += 1) {
      this.advanceParticles(substepDt, thermostatRate, singleFaceThermostat)
      const result = this.applyDsmcCollisions(substepDt, collisionDiameterMeters)
      accepted += result.accepted
      trials += result.trials
    }

    this.collisionDiagnostics.acceptedLastAdvance = accepted
    this.collisionDiagnostics.trialsLastAdvance = trials
    this.collisionDiagnostics.totalAccepted += accepted
    this.collisionDiagnostics.measuredCollisionRate = accepted / dt
    this.elapsedTime += dt
  }

  private advanceParticles(dt: number, thermostatRate: number, singleFaceThermostat: boolean): void {
    const sigma = thermalSigma(this.targetTemperature, this.massAmu)

    for (let particle = 0; particle < this.count; particle += 1) {
      const index = particle * 3
      let eligibleContacts = 0
      let thermalAxis = -1
      let thermalPositive = false
      let latestContactFraction = -1
      for (let axis = 0; axis < 3; axis += 1) {
        const component = index + axis
        const proposed = this.positions[component] +
          (this.velocities[component] * dt) / BOX_LENGTH_METERS
        const crossings = axisWallCrossings(this.positions[component], proposed)
        if (crossings.total > 0) this.wallCollisionCounts[particle] += crossings.total
        if (thermostatRate > 0) {
          if (singleFaceThermostat) {
            if (axis === 0 && crossings.positiveCount > 0) {
              eligibleContacts += crossings.positiveCount
              if (crossings.lastPositiveFraction > latestContactFraction) {
                latestContactFraction = crossings.lastPositiveFraction
                thermalAxis = 0
                thermalPositive = true
              }
            }
          } else if (crossings.total > 0) {
            eligibleContacts += crossings.total
            if (crossings.lastFraction > latestContactFraction) {
              latestContactFraction = crossings.lastFraction
              thermalAxis = axis
              thermalPositive = crossings.lastPositive
            }
          }
        }
        const [position, velocity] = foldCoordinate(proposed, this.velocities[component])
        this.positions[component] = position
        this.velocities[component] = velocity
      }
      if (thermalAxis >= 0 && eligibleContacts > 0) {
        const accommodationProbability = 1 - Math.exp(-thermostatRate * 1e-9 * eligibleContacts)
        if (this.random() < accommodationProbability) {
          this.velocities[index] = gaussian(this.random) * sigma
          this.velocities[index + 1] = gaussian(this.random) * sigma
          this.velocities[index + 2] = gaussian(this.random) * sigma
          this.velocities[index + thermalAxis] =
            (thermalPositive ? -1 : 1) * thermalWallNormalSpeed(sigma, this.random)
          this.thermalAccommodationCounts[particle] += 1
        }
      }
      const vx = this.velocities[index]
      const vy = this.velocities[index + 1]
      const vz = this.velocities[index + 2]
      this.speeds[particle] = Math.hypot(vx, vy, vz)
    }
  }

  private ensureCollisionBuffers(gridDimension: number): void {
    if (this.collisionGridDimension === gridDimension && this.cellParticleIndices.length === this.count) return
    const cellCount = gridDimension ** 3
    this.collisionGridDimension = gridDimension
    this.cellCounts = new Int32Array(cellCount)
    this.cellOffsets = new Int32Array(cellCount + 1)
    this.cellCursors = new Int32Array(cellCount)
    this.cellParticleIndices = new Int32Array(this.count)
    this.cellRelativeSpeedMax = new Float64Array(cellCount)
    this.collisionDiagnostics.gridDimension = gridDimension
  }

  private updateCollisionScales(collisionDiameterMeters: number): void {
    const numberDensity = this.count / (BOX_LENGTH_METERS ** 3)
    const crossSection = Math.PI * collisionDiameterMeters * collisionDiameterMeters
    const meanFreePath = 1 / (Math.SQRT2 * numberDensity * crossSection)
    const meanSpeed = theoreticalMeanSpeed(this.targetTemperature, this.massAmu)
    this.collisionDiagnostics.gridDimension = this.collisionGridDimension
    this.collisionDiagnostics.meanFreePath = meanFreePath
    this.collisionDiagnostics.meanCollisionTime = meanFreePath / meanSpeed
    this.collisionDiagnostics.knudsenNumber = meanFreePath / BOX_LENGTH_METERS
  }

  private applyDsmcCollisions(
    dt: number,
    collisionDiameterMeters: number,
  ): { accepted: number; trials: number } {
    const dimension = this.collisionGridDimension
    const cellCount = dimension ** 3
    this.cellCounts.fill(0)

    for (let particle = 0; particle < this.count; particle += 1) {
      const index = particle * 3
      const x = Math.min(dimension - 1, Math.floor(this.positions[index] * dimension))
      const y = Math.min(dimension - 1, Math.floor(this.positions[index + 1] * dimension))
      const z = Math.min(dimension - 1, Math.floor(this.positions[index + 2] * dimension))
      const cell = x + dimension * (y + dimension * z)
      this.cellCounts[cell] += 1
    }

    this.cellOffsets[0] = 0
    for (let cell = 0; cell < cellCount; cell += 1) {
      this.cellOffsets[cell + 1] = this.cellOffsets[cell] + this.cellCounts[cell]
      this.cellCursors[cell] = this.cellOffsets[cell]
    }

    for (let particle = 0; particle < this.count; particle += 1) {
      const index = particle * 3
      const x = Math.min(dimension - 1, Math.floor(this.positions[index] * dimension))
      const y = Math.min(dimension - 1, Math.floor(this.positions[index + 1] * dimension))
      const z = Math.min(dimension - 1, Math.floor(this.positions[index + 2] * dimension))
      const cell = x + dimension * (y + dimension * z)
      this.cellParticleIndices[this.cellCursors[cell]] = particle
      this.cellCursors[cell] += 1
    }

    const cellWidth = BOX_LENGTH_METERS / dimension
    const cellVolume = cellWidth ** 3
    const crossSection = Math.PI * collisionDiameterMeters * collisionDiameterMeters
    const baselineRelativeSpeed = 6 * thermalSigma(this.targetTemperature, this.massAmu)
    let accepted = 0
    let trials = 0

    for (let cell = 0; cell < cellCount; cell += 1) {
      const population = this.cellCounts[cell]
      if (population < 2) continue
      let maximumRelativeSpeed = Math.max(this.cellRelativeSpeedMax[cell], baselineRelativeSpeed)
      const pairCount = 0.5 * population * (population - 1)
      const expectedTrials = pairCount * crossSection * maximumRelativeSpeed * dt / cellVolume
      let cellTrials = Math.floor(expectedTrials + this.random())
      const maximumTrials = population * 8
      if (cellTrials > maximumTrials) {
        cellTrials = maximumTrials
        this.collisionDiagnostics.accuracyLimited = true
      }
      trials += cellTrials

      const start = this.cellOffsets[cell]
      for (let trial = 0; trial < cellTrials; trial += 1) {
        const localA = Math.floor(this.random() * population)
        let localB = Math.floor(this.random() * (population - 1))
        if (localB >= localA) localB += 1
        const particleA = this.cellParticleIndices[start + localA]
        const particleB = this.cellParticleIndices[start + localB]
        const a = particleA * 3
        const b = particleB * 3
        const relativeSpeed = Math.hypot(
          this.velocities[a] - this.velocities[b],
          this.velocities[a + 1] - this.velocities[b + 1],
          this.velocities[a + 2] - this.velocities[b + 2],
        )
        if (relativeSpeed > maximumRelativeSpeed) maximumRelativeSpeed = relativeSpeed * 1.05
        if (this.random() >= relativeSpeed / maximumRelativeSpeed) continue

        scatterEqualMassVelocities(this.velocities, particleA, particleB, this.random)
        this.particleCollisionCounts[particleA] += 1
        this.particleCollisionCounts[particleB] += 1
        this.speeds[particleA] = Math.hypot(
          this.velocities[a],
          this.velocities[a + 1],
          this.velocities[a + 2],
        )
        this.speeds[particleB] = Math.hypot(
          this.velocities[b],
          this.velocities[b + 1],
          this.velocities[b + 2],
        )
        accepted += 1
      }
      this.cellRelativeSpeedMax[cell] = Math.max(baselineRelativeSpeed, maximumRelativeSpeed * 0.995)
    }

    return { accepted, trials }
  }

  statistics(): SimulationStats {
    let speedSum = 0
    let speedSquaredSum = 0
    for (let i = 0; i < this.count; i += 1) {
      const speed = this.speeds[i]
      speedSum += speed
      speedSquaredSum += speed * speed
    }
    const meanSquaredSpeed = speedSquaredSum / this.count
    const massKg = this.massAmu * ATOMIC_MASS_UNIT
    const meanKineticEnergy = 0.5 * massKg * meanSquaredSpeed
    return {
      count: this.count,
      measuredTemperature: (massKg * meanSquaredSpeed) / (3 * BOLTZMANN),
      meanSpeed: speedSum / this.count,
      rmsSpeed: Math.sqrt(meanSquaredSpeed),
      meanKineticEnergy,
      totalKineticEnergy: meanKineticEnergy * this.count,
      elapsedTime: this.elapsedTime,
    }
  }

  isValid(): boolean {
    for (let i = 0; i < this.positions.length; i += 1) {
      if (!Number.isFinite(this.positions[i]) || this.positions[i] < 0 || this.positions[i] > 1) return false
      if (!Number.isFinite(this.velocities[i])) return false
    }
    return true
  }
}
