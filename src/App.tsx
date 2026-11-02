import { useCallback, useEffect, useMemo, useState } from 'react'
import { DistributionChart } from './components/DistributionChart'
import { MomentumSpaceView } from './components/MomentumSpaceView'
import { SimulationView } from './components/SimulationView'
import { SCALE_COMPARISONS, ScaleComparisonId } from './scaleComparisons'
import {
  BOLTZMANN,
  COLLISION_DIAMETERS_ANGSTROM,
  GAS_SPECIES,
  GasName,
  GasSimulation,
  maxwellBoltzmannQuantile,
  mostProbableSpeed,
  SimulationStats,
  theoreticalMeanSpeed,
  theoreticalRmsSpeed,
} from './physics'

type SpeciesSelection = GasName | 'Custom'

function formatSimulationTime(seconds: number): string {
  if (seconds < 1e-9) return `${(seconds * 1e12).toFixed(1)} ps`
  if (seconds < 1e-6) return `${(seconds * 1e9).toFixed(2)} ns`
  return `${(seconds * 1e6).toFixed(2)} μs`
}

function formatLength(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters >= 1e-3) return `${(meters * 1e3).toFixed(2)} mm`
  if (meters >= 1e-6) return `${(meters * 1e6).toFixed(2)} μm`
  return `${(meters * 1e9).toFixed(2)} nm`
}

function App() {
  const [temperature, setTemperature] = useState(300)
  const [temperatureDraft, setTemperatureDraft] = useState('300')
  const [massAmu, setMassAmu] = useState<number>(GAS_SPECIES.Argon)
  const [customMassDraft, setCustomMassDraft] = useState(String(GAS_SPECIES.Argon))
  const [species, setSpecies] = useState<SpeciesSelection>('Argon')
  const [particleCount, setParticleCount] = useState(25_000)
  const [simulation, setSimulation] = useState(() => new GasSimulation(25_000, 300, GAS_SPECIES.Argon, Math.random, 0.1e-6))
  const [playing, setPlaying] = useState(true)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [boxLengthMicrometers, setBoxLengthMicrometers] = useState(0.1)
  const [thermostatEnabled, setThermostatEnabled] = useState(true)
  const [thermostatRateNs, setThermostatRateNs] = useState(0.2)
  const [singleFaceBath, setSingleFaceBath] = useState(false)
  const [dsmcEnabled, setDsmcEnabled] = useState(true)
  const [collisionDiameterAngstrom, setCollisionDiameterAngstrom] = useState(COLLISION_DIAMETERS_ANGSTROM.Argon)
  const [particleMarkerDiameterAngstrom, setParticleMarkerDiameterAngstrom] = useState(COLLISION_DIAMETERS_ANGSTROM.Argon)
  const [matchMarkerToCollisionDiameter, setMatchMarkerToCollisionDiameter] = useState(true)
  const [particleFuzziness, setParticleFuzziness] = useState(0.35)
  const [particleOpacity, setParticleOpacity] = useState(1)
  const [scaleComparison, setScaleComparison] = useState<ScaleComparisonId>('none')
  const [bins, setBins] = useState(100)
  const [highlightFast, setHighlightFast] = useState(false)
  const [speedThreshold, setSpeedThreshold] = useState(750)
  const [speedThresholdDraft, setSpeedThresholdDraft] = useState('750')
  const [highlightedCount, setHighlightedCount] = useState(0)
  const [highlightCold, setHighlightCold] = useState(false)
  const [coldSpeedThreshold, setColdSpeedThreshold] = useState(100)
  const [coldSpeedThresholdDraft, setColdSpeedThresholdDraft] = useState('100')
  const [coldHighlightedCount, setColdHighlightedCount] = useState(0)
  const [highlightBand, setHighlightBand] = useState(false)
  const [bandCenter, setBandCenter] = useState(400)
  const [bandHalfWidth, setBandHalfWidth] = useState(10)
  const [bandHighlightedCount, setBandHighlightedCount] = useState(0)
  const [unfocusedOpacity, setUnfocusedOpacity] = useState(0.18)
  const [trackParticle, setTrackParticle] = useState(false)
  const [trackedParticleIndex, setTrackedParticleIndex] = useState(0)
  const [showMomentumSpace, setShowMomentumSpace] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const [stats, setStats] = useState<SimulationStats>(() => simulation.statistics())

  useEffect(() => {
    const update = () => {
      setStats(simulation.statistics())
      if (highlightFast) {
        let count = 0
        for (let i = 0; i < simulation.speeds.length; i += 1) {
          if (simulation.speeds[i] > speedThreshold) count += 1
        }
        setHighlightedCount(count)
      } else {
        setHighlightedCount(0)
      }
      if (highlightCold) {
        let count = 0
        for (let i = 0; i < simulation.speeds.length; i += 1) {
          if (simulation.speeds[i] < coldSpeedThreshold) count += 1
        }
        setColdHighlightedCount(count)
      } else {
        setColdHighlightedCount(0)
      }
      if (highlightBand) {
        let count = 0
        for (let i = 0; i < simulation.speeds.length; i += 1) {
          if (Math.abs(simulation.speeds[i] - bandCenter) <= bandHalfWidth) count += 1
        }
        setBandHighlightedCount(count)
      } else {
        setBandHighlightedCount(0)
      }
    }
    const interval = window.setInterval(update, 160)
    update()
    return () => window.clearInterval(interval)
  }, [simulation, highlightFast, speedThreshold, highlightCold, coldSpeedThreshold, highlightBand, bandCenter, bandHalfWidth])

  useEffect(() => {
    if (trackParticle && simulation.count > 0) {
      setTrackedParticleIndex(Math.floor(Math.random() * simulation.count))
    }
  }, [simulation, trackParticle])

  const applyTemperature = useCallback((next: number) => {
    const value = Math.max(5, Math.min(5000, Number.isFinite(next) ? next : 300))
    setTemperature(value)
    setTemperatureDraft(String(value))
    simulation.targetTemperature = value
    setThermostatEnabled(true)
  }, [simulation])

  const commitTemperatureDraft = useCallback(() => {
    if (temperatureDraft.trim() === '') {
      setTemperatureDraft(String(temperature))
      return
    }
    const parsed = Number(temperatureDraft)
    if (!Number.isFinite(parsed)) {
      setTemperatureDraft(String(temperature))
      return
    }
    applyTemperature(parsed)
  }, [applyTemperature, temperature, temperatureDraft])

  const applyHotThreshold = useCallback((next: number) => {
    if (!Number.isFinite(next) || next <= 0) return
    setSpeedThreshold(next)
    setSpeedThresholdDraft(String(next))
  }, [])

  const applyColdThreshold = useCallback((next: number) => {
    if (!Number.isFinite(next) || next <= 0) return
    setColdSpeedThreshold(next)
    setColdSpeedThresholdDraft(String(next))
  }, [])

  const commitHotThresholdDraft = useCallback(() => {
    const parsed = Number(speedThresholdDraft)
    if (speedThresholdDraft.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setSpeedThresholdDraft(String(speedThreshold))
      return
    }
    applyHotThreshold(parsed)
  }, [applyHotThreshold, speedThreshold, speedThresholdDraft])

  const commitColdThresholdDraft = useCallback(() => {
    const parsed = Number(coldSpeedThresholdDraft)
    if (coldSpeedThresholdDraft.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setColdSpeedThresholdDraft(String(coldSpeedThreshold))
      return
    }
    applyColdThreshold(parsed)
  }, [applyColdThreshold, coldSpeedThreshold, coldSpeedThresholdDraft])

  const selectHotTopPercent = () => {
    applyHotThreshold(Math.round(maxwellBoltzmannQuantile(0.99, temperature, massAmu)))
  }

  const selectColdBottomPercent = () => {
    applyColdThreshold(Math.max(1, Math.round(maxwellBoltzmannQuantile(0.01, temperature, massAmu))))
  }

  const applyBoxLength = useCallback((nextMicrometers: number) => {
    const micrometers = Math.max(0.01, Math.min(1, Number.isFinite(nextMicrometers) ? nextMicrometers : 0.1))
    setBoxLengthMicrometers(micrometers)
    simulation.setBoxLength(micrometers * 1e-6)
    setStats(simulation.statistics())
  }, [simulation])

  const rebuildSimulation = useCallback((count: number, temp: number, mass: number) => {
    const next = new GasSimulation(count, temp, mass, Math.random, boxLengthMicrometers * 1e-6)
    setSimulation(next)
    setParticleCount(count)
  }, [boxLengthMicrometers])

  const resizeParticlePopulation = useCallback((nextCount: number) => {
    const count = Math.max(100, Math.min(50_000, Math.round(nextCount / 100) * 100))
    simulation.resizeParticleCount(count)
    setParticleCount(count)
    setStats(simulation.statistics())
    if (trackParticle) setTrackedParticleIndex(Math.floor(Math.random() * count))
  }, [simulation, trackParticle])

  const changeSpecies = (next: SpeciesSelection) => {
    setSpecies(next)
    if (next !== 'Custom') {
      const mass = GAS_SPECIES[next]
      const diameter = COLLISION_DIAMETERS_ANGSTROM[next]
      setMassAmu(mass)
      setCustomMassDraft(String(mass))
      setCollisionDiameterAngstrom(diameter)
      if (matchMarkerToCollisionDiameter) setParticleMarkerDiameterAngstrom(diameter)
      rebuildSimulation(particleCount, temperature, mass)
    }
  }

  const applyCollisionDiameter = (next: number) => {
    setCollisionDiameterAngstrom(next)
    if (matchMarkerToCollisionDiameter) setParticleMarkerDiameterAngstrom(next)
  }

  const applyParticleMarkerDiameter = (next: number) => {
    setParticleMarkerDiameterAngstrom(next)
    setMatchMarkerToCollisionDiameter(false)
  }

  const toggleMarkerCollisionMatch = () => {
    setParticleMarkerDiameterAngstrom(collisionDiameterAngstrom)
    setMatchMarkerToCollisionDiameter((value) => !value)
  }

  const applyCustomMass = (next: number) => {
    const mass = Math.max(0.1, Math.min(300, Number.isFinite(next) ? next : massAmu))
    setMassAmu(mass)
    setCustomMassDraft(String(mass))
    simulation.setMass(mass, true)
  }

  const commitCustomMassDraft = () => {
    if (customMassDraft.trim() === '') {
      setCustomMassDraft(String(massAmu))
      return
    }
    const parsed = Number(customMassDraft)
    if (!Number.isFinite(parsed)) {
      setCustomMassDraft(String(massAmu))
      return
    }
    applyCustomMass(parsed)
  }

  const reset = () => {
    simulation.reset(temperature)
    setStats(simulation.statistics())
  }

  const resetSimulationOptions = () => {
    const nextSimulation = new GasSimulation(25_000, 300, GAS_SPECIES.Argon, Math.random, 0.1e-6)
    setTemperature(300)
    setTemperatureDraft('300')
    setMassAmu(GAS_SPECIES.Argon)
    setCustomMassDraft(String(GAS_SPECIES.Argon))
    setSpecies('Argon')
    setParticleCount(25_000)
    setSimulation(nextSimulation)
    setPlaying(true)
    setSpeedMultiplier(1)
    setBoxLengthMicrometers(0.1)
    setThermostatEnabled(true)
    setThermostatRateNs(0.2)
    setSingleFaceBath(false)
    setDsmcEnabled(true)
    setCollisionDiameterAngstrom(COLLISION_DIAMETERS_ANGSTROM.Argon)
    setParticleMarkerDiameterAngstrom(COLLISION_DIAMETERS_ANGSTROM.Argon)
    setMatchMarkerToCollisionDiameter(true)
    setParticleFuzziness(0.35)
    setParticleOpacity(1)
    setScaleComparison('none')
    setBins(100)
    setHighlightFast(false)
    setSpeedThreshold(750)
    setSpeedThresholdDraft('750')
    setHighlightedCount(0)
    setHighlightCold(false)
    setColdSpeedThreshold(100)
    setColdSpeedThresholdDraft('100')
    setColdHighlightedCount(0)
    setHighlightBand(false)
    setBandCenter(400)
    setBandHalfWidth(10)
    setBandHighlightedCount(0)
    setUnfocusedOpacity(0.18)
    setTrackParticle(false)
    setTrackedParticleIndex(0)
    setShowMomentumSpace(true)
    setShowInfo(false)
    setStats(nextSimulation.statistics())
  }

  const toggleThermalBath = () => {
    if (thermostatEnabled) {
      setThermostatEnabled(false)
      setSingleFaceBath(false)
    } else {
      setThermostatEnabled(true)
    }
  }

  const setUniformMeanSpeed = () => {
    simulation.setUniformMeanSpeed()
    setStats(simulation.statistics())
  }

  const alignVelocities = (axis: 0 | 1 | 2) => {
    simulation.alignVelocitiesToAxis(axis)
    setStats(simulation.statistics())
  }

  const theory = useMemo(() => ({
    mostProbable: mostProbableSpeed(temperature, massAmu),
    mean: theoreticalMeanSpeed(temperature, massAmu),
    rms: theoreticalRmsSpeed(temperature, massAmu),
  }), [temperature, massAmu])
  const collisionTheory = useMemo(() => {
    const diameter = collisionDiameterAngstrom * 1e-10
    const boxLengthMeters = boxLengthMicrometers * 1e-6
    const density = particleCount / (boxLengthMeters ** 3)
    const meanFreePath = 1 / (Math.SQRT2 * Math.PI * diameter * diameter * density)
    return {
      meanFreePath,
      knudsenNumber: meanFreePath / boxLengthMeters,
    }
  }, [boxLengthMicrometers, collisionDiameterAngstrom, particleCount])
  const boxLengthMeters = boxLengthMicrometers * 1e-6
  const numberDensityM3 = particleCount / (boxLengthMeters ** 3)
  const idealGasPressure = numberDensityM3 * BOLTZMANN * temperature
  const focusActive = highlightFast || highlightCold || highlightBand || trackParticle
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><span /><i /><b /></div>
        <div className="brand-copy">
          <h1>Hedione&apos;s <em>Ideal Gas Simulator</em></h1>
          <p>CLASSICAL IDEAL GAS · 3D STATISTICAL MECHANICS</p>
        </div>
        <div className="topbar-meta">
          <span><i className="live-dot" /> LIVE MODEL</span>
          <button className="info-button" onClick={() => setShowInfo((value) => !value)} aria-expanded={showInfo}>i</button>
          <button className="header-reset-button" type="button" onClick={resetSimulationOptions}>RESET SIMULATION</button>
        </div>
      </header>

      {showInfo && (
        <aside className="info-banner">
          <button onClick={() => setShowInfo(false)} aria-label="Close information">×</button>
          <strong>What you’re seeing</strong>
          <p>Each velocity component is sampled independently from a Gaussian with variance k<sub>B</sub>T/m. Thermal exchange occurs only at wall contacts: all six faces by default, or only the highlighted +X face when restricted. Optional DSMC collisions conserve pair momentum and energy while allowing collisional relaxation.</p>
        </aside>
      )}

      <section className="workspace">
        <SimulationView
          simulation={simulation}
          playing={playing}
          speedMultiplier={speedMultiplier}
          thermostatEnabled={thermostatEnabled}
          thermostatRate={thermostatRateNs * 1e9}
          singleFaceBath={singleFaceBath}
          dsmcEnabled={dsmcEnabled}
          collisionDiameterAngstrom={collisionDiameterAngstrom}
          particleMarkerDiameterAngstrom={particleMarkerDiameterAngstrom}
          particleFuzziness={particleFuzziness}
          particleOpacity={particleOpacity}
          scaleComparison={scaleComparison}
          highlightFast={highlightFast}
          speedThreshold={speedThreshold}
          highlightCold={highlightCold}
          coldSpeedThreshold={coldSpeedThreshold}
          highlightBand={highlightBand}
          bandCenter={bandCenter}
          bandHalfWidth={bandHalfWidth}
          unfocusedOpacity={unfocusedOpacity}
          trackParticle={trackParticle}
          trackedParticleIndex={trackedParticleIndex}
        />

        <section className={`momentum-panel ${showMomentumSpace ? 'active' : ''}`}>
          <div className="panel-heading momentum-panel-heading">
            <div>
              <span className="eyebrow">MOMENTUM SPACE</span>
              <h2>3D momentum cloud</h2>
            </div>
            <button onClick={() => setShowMomentumSpace((value) => !value)} aria-pressed={showMomentumSpace}>
              <b>MOMENTUM SPACE</b>
              <span>{showMomentumSpace ? 'VIEW ON' : 'VIEW OFF'}</span>
            </button>
          </div>
          {showMomentumSpace ? (
            <MomentumSpaceView
              simulation={simulation}
              highlightFast={highlightFast}
              speedThreshold={speedThreshold}
              highlightCold={highlightCold}
              coldSpeedThreshold={coldSpeedThreshold}
              highlightBand={highlightBand}
              bandCenter={bandCenter}
              bandHalfWidth={bandHalfWidth}
              unfocusedOpacity={unfocusedOpacity}
              trackParticle={trackParticle}
              trackedParticleIndex={trackedParticleIndex}
            />
          ) : (
            <div className="momentum-disabled">
              <i aria-hidden="true" />
              <strong>3D VIEW DISABLED</strong>
              <p>Enable to render all particles in (p<sub>x</sub>, p<sub>y</sub>, p<sub>z</sub>) space.</p>
              <button onClick={() => setShowMomentumSpace(true)}>ENABLE MOMENTUM SPACE</button>
            </div>
          )}
        </section>

        <section className="analysis-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SPEED DISTRIBUTION</span>
              <h2>Maxwell–Boltzmann profile</h2>
            </div>
          </div>
          <div className="chart-toolbar">
            <span className="sample-label">N = {particleCount.toLocaleString()}</span>
            <label className="chart-bins-control">
              <span>HISTOGRAM BINS</span>
              <input type="range" min="20" max="100" step="5" value={bins} onChange={(event) => setBins(Number(event.target.value))} onDoubleClick={() => setBins(100)} title="Double-click to reset" />
              <b>{bins}</b>
            </label>
          </div>
          <DistributionChart
            simulation={simulation}
            bins={bins}
            highlightFast={highlightFast}
            speedThreshold={speedThreshold}
            highlightCold={highlightCold}
            coldSpeedThreshold={coldSpeedThreshold}
            highlightBand={highlightBand}
            bandCenter={bandCenter}
            bandHalfWidth={bandHalfWidth}
          />

          <div className="velocity-strip">
            <div><span>v<sub>mp</sub></span><strong>{theory.mostProbable.toFixed(1)}</strong><small>m/s</small></div>
            <div><span>v̄</span><strong>{theory.mean.toFixed(1)}</strong><small>m/s</small></div>
            <div><span>v<sub>rms</sub></span><strong>{theory.rms.toFixed(1)}</strong><small>m/s</small></div>
          </div>

          <div className="stats-heading"><span>ENSEMBLE OBSERVABLES</span><i>UPDATED 6 Hz</i></div>
          <div className="stats-grid">
            <article><span>Measured temperature</span><strong>{stats.measuredTemperature.toFixed(1)} <small>K</small></strong><i className="accent-cyan" /></article>
            <article><span>Target temperature</span><strong>{temperature.toFixed(0)} <small>K</small></strong><i className="accent-gold" /></article>
            <article><span>Mean particle speed</span><strong>{stats.meanSpeed.toFixed(1)} <small>m/s</small></strong></article>
            <article><span>Physical time elapsed</span><strong>{formatSimulationTime(stats.elapsedTime)}</strong></article>
            <article><span>Mean free path</span><strong>{dsmcEnabled ? formatLength(Number.isFinite(simulation.collisionDiagnostics.meanFreePath) ? simulation.collisionDiagnostics.meanFreePath : collisionTheory.meanFreePath) : '—'}</strong></article>
            <article><span>Knudsen number</span><strong>{dsmcEnabled ? (Number.isFinite(simulation.collisionDiagnostics.knudsenNumber) ? simulation.collisionDiagnostics.knudsenNumber : collisionTheory.knudsenNumber).toFixed(3) : '—'}</strong></article>
            <article><span>DSMC collisions</span><strong>{dsmcEnabled ? simulation.collisionDiagnostics.totalAccepted.toLocaleString() : 'OFF'}</strong></article>
            <article><span>Number density</span><strong>{numberDensityM3.toExponential(3)} <small>#/m³</small></strong></article>
            <article><span>Ideal gas pressure</span><strong>{idealGasPressure < 100 ? idealGasPressure.toFixed(2) : idealGasPressure.toFixed(1)} <small>Pa</small></strong></article>
          </div>
        </section>
      </section>

      <section className="control-deck">
        <div className="playback-block">
          <span className="control-title">SIMULATION</span>
          <div className="transport">
            <button className="primary-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? 'Ⅱ' : '▶'}
            </button>
            <button onClick={reset} aria-label="Reset simulation">↻</button>
            <button className="preset-button mean" onClick={setUniformMeanSpeed} title="Set every particle to the theoretical mean speed">MEAN</button>
            <button className="preset-button axis" onClick={() => alignVelocities(0)} title="Align velocities with the x axis">X</button>
            <button className="preset-button axis" onClick={() => alignVelocities(1)} title="Align velocities with the y axis">Y</button>
            <button className="preset-button axis" onClick={() => alignVelocities(2)} title="Align velocities with the z axis">Z</button>
          </div>
          <label className="compact-slider">
            <span>TIME SCALE <b>{speedMultiplier < 0.01 ? speedMultiplier.toFixed(3) : speedMultiplier < 0.1 ? speedMultiplier.toFixed(2) : speedMultiplier.toFixed(1)}×</b></span>
            <input
              type="range"
              min="-1"
              max={Math.log10(100)}
              step="0.05"
              value={Math.log10(speedMultiplier)}
              onChange={(event) => setSpeedMultiplier(10 ** Number(event.target.value))}
              onDoubleClick={() => setSpeedMultiplier(1)}
              title="Double-click to reset"
            />
          </label>
          <label className="compact-slider box-size-slider">
            <span>BOX SIDE LENGTH <b>{boxLengthMicrometers < 0.1 ? boxLengthMicrometers.toFixed(3) : boxLengthMicrometers.toFixed(2)} μm</b></span>
            <input
              type="range"
              min="-2"
              max="0"
              step="0.01"
              value={Math.log10(boxLengthMicrometers)}
              onChange={(event) => applyBoxLength(10 ** Number(event.target.value))}
              onDoubleClick={() => applyBoxLength(0.1)}
              title="Double-click to reset"
            />
            <span className="slider-endpoints"><i>0.01 μm</i><i>1.00 μm</i></span>
          </label>
          <div className="simulation-dsmc">
            <button
              type="button"
              className={`dsmc-mode-button ${dsmcEnabled ? 'active' : ''}`}
              aria-pressed={dsmcEnabled}
              onClick={() => setDsmcEnabled((value) => !value)}
            >
              <b>DSMC COLLISIONS {dsmcEnabled ? 'ON' : 'OFF'}</b>
              <span>{dsmcEnabled ? 'hard-sphere binary collisions enabled' : 'collisionless particle motion'}</span>
            </button>
            <label className="scale-comparison-control">
              <span>REAL-WORLD SCALE COMPARISON</span>
              <select value={scaleComparison} onChange={(event) => setScaleComparison(event.target.value as ScaleComparisonId)}>
                <option value="none">None</option>
                {SCALE_COMPARISONS.map((comparison) => (
                  <option key={comparison.id} value={comparison.id}>
                    {comparison.label} — {comparison.sizeLabel}
                  </option>
                ))}
              </select>
              <small>Shows a schematic model beside the box with its exact size ratio.</small>
            </label>
          </div>
        </div>

        <div className="control-block temperature-block">
          <span className="control-title">TEMPERATURE</span>
          <div className="input-with-unit">
            <input
              type="number"
              min="5"
              max="5000"
              value={temperatureDraft}
              onChange={(event) => setTemperatureDraft(event.target.value)}
              onBlur={commitTemperatureDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  setTemperatureDraft(String(temperature))
                  event.currentTarget.blur()
                }
              }}
            />
            <span>K</span>
          </div>
          <input className="wide-slider" type="range" min="5" max="5000" step="5" value={temperature} onChange={(event) => applyTemperature(Number(event.target.value))} onDoubleClick={() => applyTemperature(300)} title="Double-click to reset" />
          <div className="range-labels"><span>5 K</span><span>5,000 K</span></div>
          <div className="bath-mode-buttons" role="group" aria-label="Thermal wall mode">
            <button
              type="button"
              className={`bath-mode-button thermal ${thermostatEnabled ? 'active' : ''}`}
              aria-pressed={thermostatEnabled}
              onClick={toggleThermalBath}
            >
              <b>THERMAL BATH</b>
              <span>all six faces</span>
            </button>
            <button
              type="button"
              className={`bath-mode-button single-face ${singleFaceBath ? 'active' : ''}`}
              aria-pressed={singleFaceBath}
              disabled={!thermostatEnabled}
              onClick={() => setSingleFaceBath((value) => !value)}
            >
              <b>RESTRICT +X</b>
              <span>one thermal face</span>
            </button>
          </div>
          <label className={`bath-rate ${thermostatEnabled ? '' : 'disabled'}`}>
            <span>WALL COUPLING <b>{thermostatRateNs.toFixed(2)} ns⁻¹</b></span>
            <input type="range" min="0.05" max="1" step="0.05" disabled={!thermostatEnabled} value={thermostatRateNs} onChange={(event) => setThermostatRateNs(Number(event.target.value))} onDoubleClick={() => setThermostatRateNs(0.2)} title="Double-click to reset" />
          </label>
        </div>

        <div className="control-block gas-population-block">
          <span className="control-title">GAS & PARTICLE POPULATION</span>
          <select value={species} onChange={(event) => changeSpecies(event.target.value as SpeciesSelection)}>
            {Object.keys(GAS_SPECIES).map((name) => <option key={name}>{name}</option>)}
            <option>Custom</option>
          </select>
          {species === 'Custom' && (
            <label className="mass-input">
              <span>PARTICLE MASS</span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0.1"
                  max="300"
                  step="0.001"
                  value={customMassDraft}
                  onChange={(event) => setCustomMassDraft(event.target.value)}
                  onBlur={commitCustomMassDraft}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      setCustomMassDraft(String(massAmu))
                      event.currentTarget.blur()
                    }
                  }}
                />
                <span>u</span>
              </div>
            </label>
          )}
          <label className="population-slider">
            <span>PARTICLE COUNT <b>{particleCount.toLocaleString()}</b></span>
            <input
              type="range"
              min="100"
              max="50000"
              step="100"
              value={particleCount}
              onChange={(event) => resizeParticlePopulation(Number(event.target.value))}
              onDoubleClick={() => resizeParticlePopulation(25_000)}
              title="Double-click to reset"
            />
            <span className="slider-endpoints"><i>100</i><i>50,000</i></span>
          </label>
          <label className="diameter-slider">
            <span>COLLISION DIAMETER <b>{collisionDiameterAngstrom.toFixed(1)} Å</b></span>
            <input
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              value={collisionDiameterAngstrom}
              onChange={(event) => applyCollisionDiameter(Number(event.target.value))}
              onDoubleClick={() => applyCollisionDiameter(species === 'Custom' ? COLLISION_DIAMETERS_ANGSTROM.Argon : COLLISION_DIAMETERS_ANGSTROM[species])}
              title="Double-click to reset"
            />
            <span className="slider-endpoints"><i>0.1 Å</i><i>20 Å</i></span>
          </label>
          <div className="diameter-slider marker-diameter-control">
            <span>PARTICLE MARKER DIAMETER <b>{particleMarkerDiameterAngstrom.toFixed(1)} Å</b></span>
            <div className="marker-diameter-row">
              <div className="marker-diameter-slider">
                <input
                  aria-label="Particle marker diameter"
                  type="range"
                  min="0.1"
                  max="20"
                  step="0.1"
                  value={particleMarkerDiameterAngstrom}
                  onChange={(event) => applyParticleMarkerDiameter(Number(event.target.value))}
                  onDoubleClick={() => {
                    setParticleMarkerDiameterAngstrom(collisionDiameterAngstrom)
                    setMatchMarkerToCollisionDiameter(true)
                  }}
                  title="Double-click to match collision diameter"
                />
                <span className="slider-endpoints"><i>0.1 Å</i><i>20 Å</i></span>
              </div>
              <button
                type="button"
                className={`marker-match-button ${matchMarkerToCollisionDiameter ? 'active' : ''}`}
                aria-pressed={matchMarkerToCollisionDiameter}
                onClick={toggleMarkerCollisionMatch}
              >
                MATCH COLLISION<br />DIAMETER
              </button>
            </div>
          </div>
          <small className="physical-scale-note">Visual diameter only; automatic visibility scaling still applies.</small>
          <label className="particle-appearance-slider">
            <span>PARTICLE FUZZINESS <b>{Math.round(particleFuzziness * 100)}%</b></span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={particleFuzziness}
              onChange={(event) => setParticleFuzziness(Number(event.target.value))}
              onDoubleClick={() => setParticleFuzziness(0.35)}
              title="Double-click to reset"
            />
          </label>
          <label className="particle-appearance-slider">
            <span>PARTICLE OPACITY <b>{Math.round(particleOpacity * 100)}%</b></span>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.01"
              value={particleOpacity}
              onChange={(event) => setParticleOpacity(Number(event.target.value))}
              onDoubleClick={() => setParticleOpacity(1)}
              title="Double-click to reset"
            />
          </label>
        </div>

        <div className="control-block focus-block">
          <span className="control-title">PARTICLE FOCUS & TRACKING</span>
          <div className="focus-button-grid">
            <button className={`focus-button hot ${highlightFast ? 'active' : ''}`} aria-pressed={highlightFast} onClick={() => setHighlightFast((value) => !value)}><b>HOT</b><span>above cutoff</span></button>
            <button className={`focus-button cold ${highlightCold ? 'active' : ''}`} aria-pressed={highlightCold} onClick={() => setHighlightCold((value) => !value)}><b>COLD</b><span>below cutoff</span></button>
            <button className={`focus-button band ${highlightBand ? 'active' : ''}`} aria-pressed={highlightBand} onClick={() => setHighlightBand((value) => !value)}><b>BAND</b><span>speed window</span></button>
            <button className={`focus-button random ${trackParticle ? 'active' : ''}`} aria-pressed={trackParticle} onClick={() => setTrackParticle((value) => !value)}><b>RANDOM</b><span>single atom</span></button>
          </div>
          {trackParticle && (
            <button
              className="track-random-button"
              onClick={() => setTrackedParticleIndex(Math.floor(Math.random() * simulation.count))}
            >
              PICK ANOTHER RANDOM PARTICLE
            </button>
          )}
          <div className={`threshold-control ${highlightFast ? '' : 'disabled'}`}>
            <div className="threshold-title-row">
              <span>HOT CUTOFF</span>
              <div className="cutoff-number-input">
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  disabled={!highlightFast}
                  value={speedThresholdDraft}
                  onChange={(event) => setSpeedThresholdDraft(event.target.value)}
                  onBlur={commitHotThresholdDraft}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      setSpeedThresholdDraft(String(speedThreshold))
                      event.currentTarget.blur()
                    }
                  }}
                  aria-label="Hot particle speed cutoff"
                />
                <span>m/s</span>
              </div>
            </div>
            <div className="threshold-slider-row">
              <input
                className="threshold-slider hot-slider"
                type="range"
                min="0"
                max="5000"
                step="10"
                disabled={!highlightFast}
                value={Math.min(5000, speedThreshold)}
                onChange={(event) => applyHotThreshold(Math.max(1, Number(event.target.value)))}
                onDoubleClick={() => applyHotThreshold(750)}
                title="Double-click to reset"
              />
              <button type="button" className="quantile-button hot" disabled={!highlightFast} onClick={selectHotTopPercent}>TOP 1%</button>
            </div>
            <small>{highlightedCount.toLocaleString()} particles above cutoff</small>
          </div>
          <div className={`threshold-control ${highlightCold ? '' : 'disabled'}`}>
            <div className="threshold-title-row">
              <span>COLD CUTOFF</span>
              <div className="cutoff-number-input">
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  disabled={!highlightCold}
                  value={coldSpeedThresholdDraft}
                  onChange={(event) => setColdSpeedThresholdDraft(event.target.value)}
                  onBlur={commitColdThresholdDraft}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      setColdSpeedThresholdDraft(String(coldSpeedThreshold))
                      event.currentTarget.blur()
                    }
                  }}
                  aria-label="Cold particle speed cutoff"
                />
                <span>m/s</span>
              </div>
            </div>
            <div className="threshold-slider-row">
              <input
                className="threshold-slider cold-slider"
                type="range"
                min="0"
                max="500"
                step="1"
                disabled={!highlightCold}
                value={Math.min(500, coldSpeedThreshold)}
                onChange={(event) => applyColdThreshold(Math.max(1, Number(event.target.value)))}
                onDoubleClick={() => applyColdThreshold(100)}
                title="Double-click to reset"
              />
              <button type="button" className="quantile-button cold" disabled={!highlightCold} onClick={selectColdBottomPercent}>BOTTOM 1%</button>
            </div>
            <small>{coldHighlightedCount.toLocaleString()} particles below cutoff</small>
          </div>
          <div className="band-controls">
            <label className={`threshold-control ${highlightBand ? '' : 'disabled'}`}>
              <span>BAND CENTER <b>{bandCenter.toLocaleString()} m/s</b></span>
              <input className="threshold-slider band-slider" type="range" min="0" max="3000" step="10" disabled={!highlightBand} value={bandCenter} onChange={(event) => setBandCenter(Number(event.target.value))} onDoubleClick={() => setBandCenter(400)} title="Double-click to reset" />
            </label>
            <label className={`threshold-control ${highlightBand ? '' : 'disabled'}`}>
              <span>HALF-WIDTH <b>±{bandHalfWidth} m/s</b></span>
              <input className="threshold-slider band-slider" type="range" min="1" max="200" step="1" disabled={!highlightBand} value={bandHalfWidth} onChange={(event) => setBandHalfWidth(Number(event.target.value))} onDoubleClick={() => setBandHalfWidth(10)} title="Double-click to reset" />
              <small>{bandHighlightedCount.toLocaleString()} particles in {Math.max(0, bandCenter - bandHalfWidth)}–{bandCenter + bandHalfWidth} m/s</small>
            </label>
          </div>
          <label className={`threshold-control opacity-control ${focusActive ? '' : 'disabled'}`}>
            <span>OTHER PARTICLES <b>{Math.round(unfocusedOpacity * 100)}% opacity</b></span>
            <input className="threshold-slider" type="range" min="0.02" max="0.75" step="0.01" disabled={!focusActive} value={unfocusedOpacity} onChange={(event) => setUnfocusedOpacity(Number(event.target.value))} onDoubleClick={() => setUnfocusedOpacity(0.18)} title="Double-click to reset" />
          </label>
        </div>

      </section>

      <footer>
        <p><strong>MODEL:</strong> {dsmcEnabled ? 'dilute hard-sphere DSMC gas with elastic binary collisions' : 'nonrelativistic, collisionless ideal gas with perfectly elastic walls'}</p>
        <p>Thermal momentum exchange occurs only at wall contacts. Restricted mode uses only the highlighted +X face; DSMC handles particle collisions.</p>
      </footer>
    </main>
  )
}

export default App
