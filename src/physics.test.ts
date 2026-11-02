import { describe, expect, it } from 'vitest'
import {
  ATOMIC_MASS_UNIT,
  BOLTZMANN,
  buildHistogram,
  characteristicMaxSpeed,
  GasSimulation,
  maxwellBoltzmannDensity,
  mostProbableSpeed,
  scatterEqualMassVelocities,
  theoreticalMeanSpeed,
  theoreticalRmsSpeed,
  thermalSigma,
} from './physics'

function seededRandom(seed = 0x12345678): () => number {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

describe('Maxwell–Boltzmann sampling', () => {
  it('produces zero-centered Gaussian velocity components with expected variance', () => {
    const temperature = 300
    const mass = 39.948
    const simulation = new GasSimulation(80_000, temperature, mass, seededRandom())
    const expectedVariance = (BOLTZMANN * temperature) / (mass * ATOMIC_MASS_UNIT)
    for (let axis = 0; axis < 3; axis += 1) {
      let sum = 0
      let squareSum = 0
      for (let i = axis; i < simulation.velocities.length; i += 3) {
        sum += simulation.velocities[i]
        squareSum += simulation.velocities[i] ** 2
      }
      const mean = sum / simulation.count
      const variance = squareSum / simulation.count - mean * mean
      expect(Math.abs(mean)).toBeLessThan(thermalSigma(temperature, mass) * 0.015)
      expect(variance / expectedVariance).toBeCloseTo(1, 1)
    }
  })

  it('sampled mean squared speed approaches 3kBT/m', () => {
    const simulation = new GasSimulation(80_000, 475, 20.1797, seededRandom(1))
    const measured = simulation.statistics().rmsSpeed ** 2
    const expected = (3 * BOLTZMANN * 475) / (20.1797 * ATOMIC_MASS_UNIT)
    expect(measured / expected).toBeCloseTo(1, 1)
  })

  it('sampled mean speed approaches the analytical mean', () => {
    const simulation = new GasSimulation(80_000, 700, 4.002602, seededRandom(2))
    expect(simulation.statistics().meanSpeed / theoreticalMeanSpeed(700, 4.002602)).toBeCloseTo(1, 1)
  })
})

describe('particle population resizing', () => {
  it('removes a random subset while preserving every surviving particle state', () => {
    const simulation = new GasSimulation(10, 300, 39.948, seededRandom(201))
    simulation.elapsedTime = 4.2e-9
    for (let particle = 0; particle < simulation.count; particle += 1) {
      const index = particle * 3
      simulation.positions[index] = (particle + 1) / 11
      simulation.positions[index + 1] = 0.25
      simulation.positions[index + 2] = 0.75
      simulation.velocities[index] = 100 + particle
      simulation.velocities[index + 1] = 200 + particle
      simulation.velocities[index + 2] = 300 + particle
      simulation.speeds[particle] = 400 + particle
      simulation.wallCollisionCounts[particle] = particle + 1
      simulation.thermalAccommodationCounts[particle] = particle + 11
      simulation.particleCollisionCounts[particle] = particle + 21
    }

    simulation.resizeParticleCount(6)

    expect(simulation.count).toBe(6)
    expect(simulation.elapsedTime).toBe(4.2e-9)
    expect(simulation.positions).toHaveLength(18)
    const survivorIds: number[] = []
    for (let particle = 0; particle < simulation.count; particle += 1) {
      const index = particle * 3
      const sourceParticle = simulation.velocities[index] - 100
      survivorIds.push(sourceParticle)
      expect(simulation.positions[index]).toBeCloseTo((sourceParticle + 1) / 11, 6)
      expect(simulation.velocities[index + 1]).toBe(200 + sourceParticle)
      expect(simulation.velocities[index + 2]).toBe(300 + sourceParticle)
      expect(simulation.speeds[particle]).toBe(400 + sourceParticle)
      expect(simulation.wallCollisionCounts[particle]).toBe(sourceParticle + 1)
      expect(simulation.thermalAccommodationCounts[particle]).toBe(sourceParticle + 11)
      expect(simulation.particleCollisionCounts[particle]).toBe(sourceParticle + 21)
    }
    expect(new Set(survivorIds).size).toBe(6)
    expect(survivorIds).toEqual([...survivorIds].sort((a, b) => a - b))
    expect(survivorIds).not.toEqual([0, 1, 2, 3, 4, 5])
  })

  it('adds particles without changing existing state and samples the new tail at the target temperature', () => {
    const simulation = new GasSimulation(400, 300, 39.948, seededRandom(202))
    const originalPositions = simulation.positions.slice()
    const originalVelocities = simulation.velocities.slice()
    const originalSpeeds = simulation.speeds.slice()
    simulation.targetTemperature = 900
    simulation.elapsedTime = 7.5e-9

    simulation.resizeParticleCount(20_400)

    expect(simulation.count).toBe(20_400)
    expect(simulation.elapsedTime).toBe(7.5e-9)
    expect(simulation.positions.slice(0, originalPositions.length)).toEqual(originalPositions)
    expect(simulation.velocities.slice(0, originalVelocities.length)).toEqual(originalVelocities)
    expect(simulation.speeds.slice(0, originalSpeeds.length)).toEqual(originalSpeeds)
    let addedSquaredSpeed = 0
    for (let particle = 400; particle < simulation.count; particle += 1) {
      const index = particle * 3
      expect(simulation.positions[index]).toBeGreaterThanOrEqual(0)
      expect(simulation.positions[index]).toBeLessThan(1)
      expect(simulation.positions[index + 1]).toBeGreaterThanOrEqual(0)
      expect(simulation.positions[index + 1]).toBeLessThan(1)
      expect(simulation.positions[index + 2]).toBeGreaterThanOrEqual(0)
      expect(simulation.positions[index + 2]).toBeLessThan(1)
      expect(simulation.wallCollisionCounts[particle]).toBe(0)
      expect(simulation.thermalAccommodationCounts[particle]).toBe(0)
      expect(simulation.particleCollisionCounts[particle]).toBe(0)
      addedSquaredSpeed += simulation.speeds[particle] ** 2
    }
    const measuredMeanSquare = addedSquaredSpeed / 20_000
    const expectedMeanSquare = (3 * BOLTZMANN * 900) / (39.948 * ATOMIC_MASS_UNIT)
    expect(measuredMeanSquare / expectedMeanSquare).toBeCloseTo(1, 1)
    expect(simulation.isValid()).toBe(true)
  })
})

describe('distribution calculations', () => {
  it('normalizes histogram density by population and bin width', () => {
    const speeds = new Float32Array([0.1, 0.4, 0.7, 1.2, 1.7, 1.9])
    const histogram = buildHistogram(speeds, 4, 2)
    const integral = histogram.density.reduce((sum, density) => sum + density * histogram.binWidth, 0)
    expect(integral).toBeCloseTo(1, 12)
    expect(histogram.density).toEqual([2 / 3, 1 / 3, 1 / 3, 2 / 3])
  })

  it('numerically integrates the theoretical density to one', () => {
    const temperature = 300
    const mass = 39.948
    const max = characteristicMaxSpeed(temperature, mass) * 2
    const steps = 20_000
    const dx = max / steps
    let integral = 0
    for (let i = 0; i <= steps; i += 1) {
      const weight = i === 0 || i === steps ? 0.5 : 1
      integral += weight * maxwellBoltzmannDensity(i * dx, temperature, mass) * dx
    }
    expect(integral).toBeCloseTo(1, 5)
  })

  it('characteristic speeds follow sqrt(T) and inverse sqrt(m) scaling', () => {
    const base = mostProbableSpeed(250, 40)
    expect(mostProbableSpeed(1000, 40) / base).toBeCloseTo(2, 12)
    expect(mostProbableSpeed(250, 160) / base).toBeCloseTo(0.5, 12)
    expect(theoreticalRmsSpeed(500, 20) / theoreticalRmsSpeed(500, 80)).toBeCloseTo(2, 12)
  })
})

describe('nonequilibrium controls', () => {
  it('sets every particle to the theoretical mean speed without changing directions', () => {
    const simulation = new GasSimulation(2_000, 450, 39.948, seededRandom(301))
    const firstDirection = Array.from(simulation.velocities.slice(0, 3))
    const firstMagnitude = Math.hypot(...firstDirection)
    simulation.elapsedTime = 3e-9
    simulation.wallCollisionCounts.fill(4)

    simulation.setUniformMeanSpeed()

    const expected = theoreticalMeanSpeed(450, 39.948)
    for (const speed of simulation.speeds) expect(speed / expected).toBeCloseTo(1, 6)
    const newMagnitude = Math.hypot(
      simulation.velocities[0],
      simulation.velocities[1],
      simulation.velocities[2],
    )
    for (let axis = 0; axis < 3; axis += 1) {
      expect(simulation.velocities[axis] / newMagnitude).toBeCloseTo(firstDirection[axis] / firstMagnitude, 6)
    }
    expect(simulation.elapsedTime).toBe(0)
    expect(simulation.wallCollisionCounts.every((count) => count === 0)).toBe(true)
  })

  it('aligns velocities to one axis while preserving every particle speed and total energy', () => {
    const simulation = new GasSimulation(2_000, 300, 39.948, seededRandom(302))
    const speedsBefore = simulation.speeds.slice()
    const energyBefore = simulation.statistics().totalKineticEnergy

    simulation.alignVelocitiesToAxis(1)

    for (let particle = 0; particle < simulation.count; particle += 1) {
      const index = particle * 3
      expect(simulation.velocities[index]).toBe(0)
      expect(simulation.velocities[index + 2]).toBe(0)
      expect(Math.abs(simulation.velocities[index + 1]) / speedsBefore[particle]).toBeCloseTo(1, 6)
      expect(simulation.speeds[particle] / speedsBefore[particle]).toBeCloseTo(1, 6)
    }
    expect(simulation.statistics().totalKineticEnergy / energyBefore).toBeCloseTo(1, 6)
  })
})

describe('dynamics', () => {
  it('an equal-mass DSMC scatter conserves pair momentum and kinetic energy', () => {
    const velocities = new Float32Array([320, -45, 110, -140, 90, -70])
    const momentumBefore = [
      velocities[0] + velocities[3],
      velocities[1] + velocities[4],
      velocities[2] + velocities[5],
    ]
    const energyBefore = velocities.reduce((sum, component) => sum + component * component, 0)
    scatterEqualMassVelocities(velocities, 0, 1, seededRandom(99))
    const momentumAfter = [
      velocities[0] + velocities[3],
      velocities[1] + velocities[4],
      velocities[2] + velocities[5],
    ]
    const energyAfter = velocities.reduce((sum, component) => sum + component * component, 0)
    // Velocity storage is Float32, so conservation is tested at its rounding scale.
    expect(momentumAfter[0]).toBeCloseTo(momentumBefore[0], 4)
    expect(momentumAfter[1]).toBeCloseTo(momentumBefore[1], 4)
    expect(momentumAfter[2]).toBeCloseTo(momentumBefore[2], 4)
    expect(energyAfter / energyBefore).toBeCloseTo(1, 6)
  })

  it('spatial DSMC produces collisions while conserving isolated total energy', () => {
    const simulation = new GasSimulation(5_000, 300, 39.948, seededRandom(101))
    const energyBefore = simulation.statistics().totalKineticEnergy
    simulation.advance(1e-9, 0, false, true, 5e-9)
    const energyAfter = simulation.statistics().totalKineticEnergy
    expect(simulation.collisionDiagnostics.acceptedLastAdvance).toBeGreaterThan(0)
    expect(simulation.collisionDiagnostics.trialsLastAdvance).toBeGreaterThan(
      simulation.collisionDiagnostics.acceptedLastAdvance,
    )
    expect(energyAfter / energyBefore).toBeCloseTo(1, 5)
    expect(simulation.collisionDiagnostics.gridDimension).toBeGreaterThan(1)
    const countedParticleCollisions = simulation.particleCollisionCounts.reduce((sum, count) => sum + count, 0)
    expect(countedParticleCollisions).toBe(2 * simulation.collisionDiagnostics.totalAccepted)
    expect(simulation.isValid()).toBe(true)
  })

  it('reports the hard-sphere mean free path and Knudsen number', () => {
    const simulation = new GasSimulation(30_000, 300, 39.948, seededRandom(102))
    const diameter = 3.542e-10
    simulation.advance(1e-11, 0, false, true, diameter)
    const numberDensity = 30_000 / 1e-18
    const expected = 1 / (Math.SQRT2 * Math.PI * diameter * diameter * numberDensity)
    expect(simulation.collisionDiagnostics.meanFreePath / expected).toBeCloseTo(1, 10)
    expect(simulation.collisionDiagnostics.knudsenNumber).toBeCloseTo(expected / 1e-6, 8)
  })

  it('uses the selected physical box length for wall transit and collision scales', () => {
    const simulation = new GasSimulation(30_000, 300, 39.948, seededRandom(104))
    const boxLength = 0.5e-6
    const diameter = 3.542e-10
    simulation.setBoxLength(boxLength)
    simulation.advance(1e-11, 0, false, true, diameter)

    const numberDensity = simulation.count / (boxLength ** 3)
    const expectedMeanFreePath = 1 / (Math.SQRT2 * Math.PI * diameter * diameter * numberDensity)
    expect(simulation.collisionDiagnostics.meanFreePath / expectedMeanFreePath).toBeCloseTo(1, 10)
    expect(simulation.collisionDiagnostics.knudsenNumber).toBeCloseTo(expectedMeanFreePath / boxLength, 8)

    const wallSimulation = new GasSimulation(1, 300, 39.948, seededRandom(105))
    wallSimulation.setBoxLength(boxLength)
    wallSimulation.positions.set([0.5, 0.5, 0.5])
    wallSimulation.velocities.set([100, 0, 0])
    wallSimulation.speeds[0] = 100
    wallSimulation.advance(4e-9)
    expect(wallSimulation.positions[0]).toBeCloseTo(0.7, 6)
    expect(wallSimulation.velocities[0]).toBeCloseTo(-100, 6)
    expect(wallSimulation.wallCollisionCounts[0]).toBe(1)
  })

  it('DSMC collisions isotropize a two-stream nonequilibrium ensemble without a bath', () => {
    const simulation = new GasSimulation(4_000, 300, 39.948, seededRandom(103))
    for (let particle = 0; particle < simulation.count; particle += 1) {
      const index = particle * 3
      simulation.velocities[index] = particle % 2 === 0 ? 300 : -300
      simulation.velocities[index + 1] = 0
      simulation.velocities[index + 2] = 0
      simulation.speeds[particle] = 300
    }
    const energyBefore = simulation.statistics().totalKineticEnergy
    for (let step = 0; step < 200; step += 1) {
      simulation.advance(2e-10, 0, false, true, 5e-9)
    }
    let xEnergy = 0
    let totalSquaredSpeed = 0
    for (let particle = 0; particle < simulation.count; particle += 1) {
      const index = particle * 3
      xEnergy += simulation.velocities[index] ** 2
      totalSquaredSpeed += simulation.speeds[particle] ** 2
    }
    expect(xEnergy / totalSquaredSpeed).toBeLessThan(0.6)
    expect(simulation.statistics().totalKineticEnergy / energyBefore).toBeCloseTo(1, 4)
    expect(simulation.collisionDiagnostics.totalAccepted).toBeGreaterThan(simulation.count)
  })

  it('elastic wall collisions preserve kinetic energy, including multiple crossings', () => {
    const simulation = new GasSimulation(1_000, 900, 39.948, seededRandom(3))
    const before = simulation.statistics().totalKineticEnergy
    simulation.advance(3.7e-6)
    const after = simulation.statistics().totalKineticEnergy
    expect(after / before).toBeCloseTo(1, 6)
    expect(simulation.isValid()).toBe(true)
  })

  it('six thermal walls relax the gas toward their bath temperature', () => {
    const simulation = new GasSimulation(5_000, 100, 39.948, seededRandom(4))
    simulation.targetTemperature = 800
    for (let i = 0; i < 1_000; i += 1) simulation.advance(2e-11, 1e20)
    expect(simulation.statistics().measuredTemperature / 800).toBeCloseTo(1, 1)
  })

  it('an all-face bath perturbs velocity only after a wall contact', () => {
    const simulation = new GasSimulation(1, 300, 39.948, seededRandom(41))
    simulation.targetTemperature = 1000
    simulation.positions.set([0.5, 0.5, 0.5])
    simulation.velocities.set([100, 0, 0])
    simulation.speeds[0] = 100
    simulation.advance(1e-10, 1e20, false)
    expect(simulation.speeds[0]).toBeCloseTo(100, 6)
    expect(simulation.wallCollisionCounts[0]).toBe(0)
    expect(simulation.thermalAccommodationCounts[0]).toBe(0)

    simulation.positions.set([0.5, 0.001, 0.5])
    simulation.velocities.set([0, -100, 0])
    simulation.speeds[0] = 100
    simulation.advance(2e-11, 1e20, false)
    expect(simulation.velocities[1]).toBeGreaterThanOrEqual(0)
    expect(simulation.speeds[0]).not.toBeCloseTo(100, 2)
    expect(simulation.wallCollisionCounts[0]).toBeGreaterThan(0)
    expect(simulation.thermalAccommodationCounts[0]).toBeGreaterThan(0)
  })

  it('all six thermal faces re-emit particles inward', () => {
    for (let face = 0; face < 6; face += 1) {
      const simulation = new GasSimulation(1, 300, 39.948, seededRandom(50 + face))
      simulation.targetTemperature = 1000
      simulation.positions.set([0.5, 0.5, 0.5])
      simulation.velocities.set([0, 0, 0])
      const axis = Math.floor(face / 2)
      const positiveFace = face % 2 === 1
      simulation.positions[axis] = positiveFace ? 0.999 : 0.001
      simulation.velocities[axis] = positiveFace ? 100 : -100
      simulation.speeds[0] = 100
      simulation.advance(2e-11, 1e20, false)
      expect(positiveFace ? simulation.velocities[axis] : -simulation.velocities[axis]).toBeLessThanOrEqual(0)
      expect(simulation.isValid()).toBe(true)
    }
  })

  it('single-face thermal contact acts only at the positive-x wall', () => {
    const simulation = new GasSimulation(1, 300, 39.948, seededRandom(7))
    simulation.targetTemperature = 1000
    simulation.positions.set([0.5, 0.5, 0.5])
    simulation.velocities.set([100, 0, 0])
    simulation.speeds[0] = 100
    simulation.advance(1e-10, 1e20, true)
    expect(simulation.speeds[0]).toBeCloseTo(100, 6)

    simulation.positions.set([0.99, 0.5, 0.5])
    simulation.velocities.set([100, 0, 0])
    simulation.speeds[0] = 100
    simulation.advance(2e-10, 1e20, true)
    expect(simulation.velocities[0]).toBeLessThanOrEqual(0)
    expect(simulation.speeds[0]).not.toBeCloseTo(100, 2)
    expect(simulation.isValid()).toBe(true)
  })

  it('a single thermal wall preserves an equilibrium temperature without cooling bias', () => {
    const targetTemperature = 500
    const simulation = new GasSimulation(20_000, targetTemperature, 39.948, seededRandom(8))
    for (let i = 0; i < 500; i += 1) simulation.advance(2e-11, 1e20, true)
    expect(simulation.statistics().measuredTemperature / targetTemperature).toBeCloseTo(1, 1)
  })

  it('bath-off dynamics conserve measured temperature', () => {
    const simulation = new GasSimulation(20_000, 350, 28.0134, seededRandom(5))
    const before = simulation.statistics().measuredTemperature
    for (let i = 0; i < 20; i += 1) simulation.advance(2e-8)
    expect(simulation.statistics().measuredTemperature / before).toBeCloseTo(1, 6)
  })

  it('control-like changes never corrupt buffers or release particles', () => {
    const simulation = new GasSimulation(5_000, 50, 131.293, seededRandom(6))
    simulation.setMass(0.1)
    simulation.resampleVelocities(2000)
    simulation.advance(1e-4, 1e9)
    simulation.advance(Number.NaN)
    expect(simulation.isValid()).toBe(true)
    expect(simulation.positions).toHaveLength(15_000)
    expect(simulation.velocities.every(Number.isFinite)).toBe(true)
    expect(simulation.speeds.every(Number.isFinite)).toBe(true)
  })
})
