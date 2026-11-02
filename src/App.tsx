import { useCallback, useEffect, useMemo, useState } from 'react'
import { DistributionChart } from './components/DistributionChart'
import { MomentumSpaceView } from './components/MomentumSpaceView'
import { SimulationView } from './components/SimulationView'
import {
  BOLTZMANN,
  COLLISION_DIAMETERS_ANGSTROM,
  GAS_SPECIES,
  GasName,
  GasSimulation,
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}

function App() {
  const [temperature, setTemperature] = useState(300)
  const [temperatureDraft, setTemperatureDraft] = useState('300')
  const [massAmu, setMassAmu] = useState<number>(GAS_SPECIES.Argon)
  const [species, setSpecies] = useState<SpeciesSelection>('Argon')
  const [particleCount, setParticleCount] = useState(10_000)
  const [simulation, setSimulation] = useState(() => new GasSimulation(10_000, 300, GAS_SPECIES.Argon))
  const [playing, setPlaying] = useState(true)
  const [speedMultiplier, setSpeedMultiplier] = useState(0.01)
  const [boxLengthMicrometers, setBoxLengthMicrometers] = useState(1)
  const [thermostatEnabled, setThermostatEnabled] = useState(true)
  const [thermostatRateNs, setThermostatRateNs] = useState(0.2)
  const [singleFaceBath, setSingleFaceBath] = useState(false)
  const [dsmcEnabled, setDsmcEnabled] = useState(true)
  const [collisionDiameterAngstrom, setCollisionDiameterAngstrom] = useState(COLLISION_DIAMETERS_ANGSTROM.Argon)
  const [particleMarkerSize, setParticleMarkerSize] = useState(1)
  const [bins, setBins] = useState(100)
  const [highlightFast, setHighlightFast] = useState(false)
  const [speedThreshold, setSpeedThreshold] = useState(500)
  const [highlightedCount, setHighlightedCount] = useState(0)
  const [highlightCold, setHighlightCold] = useState(false)
  const [coldSpeedThreshold, setColdSpeedThreshold] = useState(100)
  const [coldHighlightedCount, setColdHighlightedCount] = useState(0)
  const [highlightBand, setHighlightBand] = useState(false)
  const [bandCenter, setBandCenter] = useState(400)
  const [bandHalfWidth, setBandHalfWidth] = useState(10)
  const [bandHighlightedCount, setBandHighlightedCount] = useState(0)
  const [unfocusedOpacity, setUnfocusedOpacity] = useState(0.18)
  const [trackParticle, setTrackParticle] = useState(false)
  const [trackedParticleIndex, setTrackedParticleIndex] = useState(0)
  const [showMomentumSpace, setShowMomentumSpace] = useState(false)
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

  const applyBoxLength = useCallback((nextMicrometers: number) => {
    const micrometers = Math.max(0.1, Math.min(1, Number.isFinite(nextMicrometers) ? nextMicrometers : 1))
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
      setMassAmu(mass)
      setCollisionDiameterAngstrom(COLLISION_DIAMETERS_ANGSTROM[next])
      rebuildSimulation(particleCount, temperature, mass)
    }
  }

  const applyCustomMass = (next: number) => {
    const mass = Math.max(0.1, Math.min(300, Number.isFinite(next) ? next : massAmu))
    setMassAmu(mass)
    simulation.setMass(mass, true)
  }

  const reset = () => {
    simulation.reset(temperature)
    setStats(simulation.statistics())
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
      gridDimension: Math.max(1, Math.min(16, Math.round(Math.cbrt(particleCount / 64)))),
    }
  }, [boxLengthMicrometers, collisionDiameterAngstrom, particleCount])
  const boxLengthMeters = boxLengthMicrometers * 1e-6
  const numberDensityCm3 = particleCount / ((boxLengthMeters * 100) ** 3)
  const idealGasPressure = (particleCount / (boxLengthMeters ** 3)) * BOLTZMANN * temperature
  const focusActive = highlightFast || highlightCold || highlightBand || trackParticle
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><span /><i /><b /></div>
        <div className="brand-copy">
          <h1>Maxwell–Boltzmann <em>Lab</em></h1>
          <p>CLASSICAL IDEAL GAS · 3D STATISTICAL MECHANICS</p>
        </div>
        <div className="topbar-meta">
          <span><i className="live-dot" /> LIVE MODEL</span>
          <span>BOX <b>{boxLengthMicrometers.toFixed(2)} μm</b></span>
          <button className="info-button" onClick={() => setShowInfo((value) => !value)} aria-expanded={showInfo}>i</button>
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
          particleMarkerSize={particleMarkerSize}
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
              {showMomentumSpace ? 'VIEW ON' : 'VIEW OFF'}
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
            <article><span>Knudsen number</span><strong>{dsmcEnabled ? (Number.isFinite(simulation.collisionDiagnostics.knudsenNumber) ? simulation.collisionDiagnostics.knudsenNumber : collisionTheory.knudsenNumber).toFixed(1) : '—'}</strong></article>
            <article><span>DSMC collisions</span><strong>{dsmcEnabled ? simulation.collisionDiagnostics.totalAccepted.toLocaleString() : 'OFF'}</strong></article>
            <article><span>Collision grid</span><strong>{dsmcEnabled ? `${simulation.collisionDiagnostics.gridDimension || collisionTheory.gridDimension}³` : '—'}</strong></article>
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
              min="-3"
              max={Math.log10(3)}
              step="0.05"
              value={Math.log10(speedMultiplier)}
              onChange={(event) => setSpeedMultiplier(10 ** Number(event.target.value))}
              onDoubleClick={() => setSpeedMultiplier(0.01)}
              title="Double-click to reset"
            />
          </label>
          <label className="compact-slider box-size-slider">
            <span>BOX SIDE LENGTH <b>{boxLengthMicrometers.toFixed(2)} μm</b></span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={boxLengthMicrometers}
              onChange={(event) => applyBoxLength(Number(event.target.value))}
              onDoubleClick={() => applyBoxLength(1)}
              title="Double-click to reset"
            />
            <span className="slider-endpoints"><i>0.10 μm</i><i>1.00 μm</i></span>
          </label>
          <div className="simulation-dsmc">
            <Toggle label="DSMC collisions" checked={dsmcEnabled} onChange={setDsmcEnabled} />
            {dsmcEnabled && (
              <div className={`dsmc-status ${simulation.collisionDiagnostics.accuracyLimited ? 'warning' : ''}`}>
                <span>HARD-SPHERE DSMC</span>
                <b>{simulation.collisionDiagnostics.gridDimension || collisionTheory.gridDimension}³ cells · {simulation.collisionDiagnostics.acceptedLastAdvance} recent collisions</b>
                {simulation.collisionDiagnostics.accuracyLimited && <small>Accuracy limit reached—reduce time scale or diameter.</small>}
              </div>
            )}
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
                <input type="number" min="0.1" max="300" step="0.001" value={massAmu} onChange={(event) => applyCustomMass(Number(event.target.value))} />
                <span>u</span>
              </div>
            </label>
          )}
          <label className="diameter-slider">
            <span>COLLISION DIAMETER <b>{collisionDiameterAngstrom.toFixed(1)} Å</b></span>
            <input
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              value={collisionDiameterAngstrom}
              onChange={(event) => setCollisionDiameterAngstrom(Number(event.target.value))}
              onDoubleClick={() => setCollisionDiameterAngstrom(species === 'Custom' ? COLLISION_DIAMETERS_ANGSTROM.Argon : COLLISION_DIAMETERS_ANGSTROM[species])}
              title="Double-click to reset"
            />
            <span className="slider-endpoints"><i>0.1 Å</i><i>20 Å</i></span>
          </label>
          <label className="diameter-slider marker-size-slider">
            <span>PARTICLE MARKER SIZE <b>{particleMarkerSize.toFixed(2)}×</b></span>
            <input type="range" min="0.25" max="2.5" step="0.05" value={particleMarkerSize} onChange={(event) => setParticleMarkerSize(Number(event.target.value))} onDoubleClick={() => setParticleMarkerSize(1)} title="Double-click to reset" />
            <span className="slider-endpoints"><i>small</i><i>large</i></span>
          </label>
          <small className="physical-scale-note">Visual marker size is independent of collision diameter.</small>
          <label className="population-slider">
            <span>PARTICLE COUNT <b>{particleCount.toLocaleString()}</b></span>
            <input
              type="range"
              min="100"
              max="50000"
              step="100"
              value={particleCount}
              onChange={(event) => resizeParticlePopulation(Number(event.target.value))}
              onDoubleClick={() => resizeParticlePopulation(10_000)}
              title="Double-click to reset"
            />
            <span className="slider-endpoints"><i>100</i><i>50,000</i></span>
          </label>
          <div className="population-metrics">
            <div><span>NUMBER DENSITY</span><b>{numberDensityCm3.toExponential(2)}</b><small>particles/cm³</small></div>
            <div><span>IDEAL PRESSURE</span><b>{idealGasPressure < 100 ? idealGasPressure.toFixed(2) : idealGasPressure.toFixed(1)}</b><small>Pa</small></div>
          </div>
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
          <label className={`threshold-control ${highlightFast ? '' : 'disabled'}`}>
            <span>HOT CUTOFF <b>{speedThreshold.toLocaleString()} m/s</b></span>
            <input
              className="threshold-slider hot-slider"
              type="range"
              min="0"
              max="5000"
              step="10"
              disabled={!highlightFast}
              value={speedThreshold}
              onChange={(event) => setSpeedThreshold(Number(event.target.value))}
              onDoubleClick={() => setSpeedThreshold(500)}
              title="Double-click to reset"
            />
            <small>{highlightedCount.toLocaleString()} particles above cutoff</small>
          </label>
          <label className={`threshold-control ${highlightCold ? '' : 'disabled'}`}>
            <span>COLD CUTOFF <b>{coldSpeedThreshold.toLocaleString()} m/s</b></span>
            <input
              className="threshold-slider cold-slider"
              type="range"
              min="0"
              max="500"
              step="1"
              disabled={!highlightCold}
              value={coldSpeedThreshold}
              onChange={(event) => setColdSpeedThreshold(Number(event.target.value))}
              onDoubleClick={() => setColdSpeedThreshold(100)}
              title="Double-click to reset"
            />
            <small>{coldHighlightedCount.toLocaleString()} particles below cutoff</small>
          </label>
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
