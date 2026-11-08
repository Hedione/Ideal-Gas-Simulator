import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { DistributionChart } from './components/DistributionChart'
import { EntryDialog } from './components/EntryDialog'
import { MomentumSpaceView } from './components/MomentumSpaceView'
import { SimulationView } from './components/SimulationView'
import { initialWalkthrough, isModuleVisible, WALKTHROUGH_STEPS, walkthroughReducer, WalkthroughModule, WalkthroughTask } from './walkthrough'
import {
  BOLTZMANN,
  COLLISION_DIAMETERS_ANGSTROM,
  GAS_SPECIES,
  GasName,
  GasSimulation,
  maxwellBoltzmannQuantile,
  mostProbableSpeed,
  SimulationStats,
  ThermalWallAxis,
  ThermalWallContact,
  theoreticalMeanSpeed,
  theoreticalRmsSpeed,
} from './physics'

type SpeciesSelection = GasName | 'Custom'
type ThermalBathMode = 'all' | 'one' | 'two'

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

function formatSimulationRate(multiplier: number): string {
  const secondsPerSecond = 1e-10 * multiplier
  if (secondsPerSecond >= 1e-9) return `${(secondsPerSecond * 1e9).toFixed(2)} ns/s`
  return `${(secondsPerSecond * 1e12).toFixed(secondsPerSecond >= 1e-12 ? 2 : 3)} ps/s`
}

function App() {
  const [keyboardNavigation, setKeyboardNavigation] = useState(false)
  const [walkthrough, dispatchWalkthrough] = useReducer(walkthroughReducer, initialWalkthrough)
  const walking = walkthrough.mode === 'walkthrough'
  const currentStep = WALKTHROUGH_STEPS[walkthrough.step]
  const currentTask = currentStep.tasks[walkthrough.task]
  const lastTask = walkthrough.task === currentStep.tasks.length - 1
  const lastStep = walkthrough.step === WALKTHROUGH_STEPS.length - 1
  const visible = (module: WalkthroughModule) => isModuleVisible(walkthrough, module)
  const currentModuleClass = (module: WalkthroughModule) => walking && currentStep.id === module ? ' walkthrough-current' : ''
  const completeTask = (task: WalkthroughTask) => dispatchWalkthrough({ type: 'interact', task })

  useEffect(() => {
    if (!walking) return
    const target = currentTask.id === 'header-reset'
      ? document.querySelector<HTMLButtonElement>('.header-reset-button')
      : currentTask.id === 'information'
        ? document.querySelector<HTMLButtonElement>('.info-button')
        : document.getElementById(`walkthrough-${currentStep.id}`)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest' })
  }, [walking, currentStep.id, currentTask.id])

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
  const [diffuseReflectionPercent, setDiffuseReflectionPercent] = useState(100)
  const [thermalBathMode, setThermalBathMode] = useState<ThermalBathMode>('all')
  const [primaryWallAxis, setPrimaryWallAxis] = useState<ThermalWallAxis>(0)
  const [primaryWallPositive, setPrimaryWallPositive] = useState(true)
  const [secondaryWallAxis, setSecondaryWallAxis] = useState<ThermalWallAxis>(0)
  const [secondaryWallPositive, setSecondaryWallPositive] = useState(false)
  const [secondaryWallTemperature, setSecondaryWallTemperature] = useState(300)
  const [secondaryWallMatchesMain, setSecondaryWallMatchesMain] = useState(true)
  const [dsmcEnabled, setDsmcEnabled] = useState(true)
  const [collisionDiameterAngstrom, setCollisionDiameterAngstrom] = useState(COLLISION_DIAMETERS_ANGSTROM.Argon)
  const [particleMarkerDiameterAngstrom, setParticleMarkerDiameterAngstrom] = useState(COLLISION_DIAMETERS_ANGSTROM.Argon)
  const [matchMarkerToCollisionDiameter, setMatchMarkerToCollisionDiameter] = useState(true)
  const [particleOcclusionEnabled, setParticleOcclusionEnabled] = useState(false)
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
  const [momentumPointSize, setMomentumPointSize] = useState(1)
  const [momentumViewResetKey, setMomentumViewResetKey] = useState(0)
  const [brownianEnabled, setBrownianEnabled] = useState(false)
  const [brownianDiameterAngstrom, setBrownianDiameterAngstrom] = useState(100)
  const [brownianMassAmu, setBrownianMassAmu] = useState(1e4)
  const [brownianFocus, setBrownianFocus] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [stats, setStats] = useState<SimulationStats>(() => simulation.statistics())

  const closeInfo = useCallback(() => {
    setShowInfo(false)
    if (showInfo) dispatchWalkthrough({ type: 'interact', task: 'information' })
  }, [showInfo])

  const toggleFocus = useCallback((mode: 'hot' | 'cold' | 'band' | 'random') => {
    const [enabled, setEnabled] = ({
      hot: [highlightFast, setHighlightFast],
      cold: [highlightCold, setHighlightCold],
      band: [highlightBand, setHighlightBand],
      random: [trackParticle, setTrackParticle],
    } as const)[mode]
    setEnabled((value) => !value)
    if (!enabled) dispatchWalkthrough({ type: 'interact', task: 'focus' })
  }, [highlightFast, highlightCold, highlightBand, trackParticle])

  const toggleParticleOcclusion = useCallback(() => {
    setParticleOcclusionEnabled((value) => !value)
    if (!particleOcclusionEnabled) dispatchWalkthrough({ type: 'interact', task: 'occlusion' })
  }, [particleOcclusionEnabled])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Tab') setKeyboardNavigation(true)
      if (showInfo || walkthrough.mode === 'choose' || event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
      const key = event.key.toLowerCase()
      if (key === ' ') {
        event.preventDefault()
        // Space is the playback shortcut; clear the last clicked control's focus outline.
        if (target instanceof HTMLElement) target.blur()
        if (isModuleVisible(walkthrough, 'simulation')) setPlaying((value) => !value)
      } else if (key === 'o' && isModuleVisible(walkthrough, 'simulation')) {
        event.preventDefault()
        toggleParticleOcclusion()
      } else if (key === 't' && isModuleVisible(walkthrough, 'temperature')) {
        event.preventDefault()
        setThermostatEnabled((value) => !value)
      } else if (isModuleVisible(walkthrough, 'focus')) {
        const mode = key === 'h' ? 'hot' : key === 'c' ? 'cold' : key === 'b' ? 'band' : key === 'r' ? 'random' : null
        if (mode) {
          event.preventDefault()
          toggleFocus(mode)
        }
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [showInfo, walkthrough, toggleFocus, toggleParticleOcclusion])

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

  useEffect(() => {
    const maximumDiameter = Math.max(5, Math.min(500, boxLengthMicrometers * 1e4 * 0.8))
    setBrownianDiameterAngstrom((value) => Math.min(value, maximumDiameter))
  }, [boxLengthMicrometers])

  useEffect(() => {
    if (!showInfo) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeInfo()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showInfo, closeInfo])

  const applyTemperature = useCallback((next: number) => {
    const value = Math.max(5, Math.min(5000, Number.isFinite(next) ? next : 300))
    if (value !== simulation.targetTemperature) {
      if (value >= 500) dispatchWalkthrough({ type: 'interact', task: 'heat' })
      if (value < 10 && thermalBathMode === 'one') dispatchWalkthrough({ type: 'interact', task: 'cool' })
    }
    setTemperature(value)
    setTemperatureDraft(String(value))
    simulation.targetTemperature = value
    setThermostatEnabled(true)
  }, [simulation, thermalBathMode])

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
    if (micrometers !== boxLengthMicrometers) dispatchWalkthrough({ type: 'interact', task: 'box-size' })
    setBoxLengthMicrometers(micrometers)
    simulation.setBoxLength(micrometers * 1e-6)
    setStats(simulation.statistics())
  }, [simulation, boxLengthMicrometers])

  const rebuildSimulation = useCallback((count: number, temp: number, mass: number) => {
    const next = new GasSimulation(count, temp, mass, Math.random, boxLengthMicrometers * 1e-6)
    setSimulation(next)
    setParticleCount(count)
  }, [boxLengthMicrometers])

  const resizeParticlePopulation = useCallback((nextCount: number) => {
    const count = Math.max(100, Math.min(50_000, Math.round(nextCount / 100) * 100))
    if (count !== simulation.count) dispatchWalkthrough({ type: 'interact', task: 'population' })
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
    if (next > collisionDiameterAngstrom) completeTask('collision-diameter')
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

  const resetSimulationOptions = (preserveGasView = false) => {
    const nextSimulation = preserveGasView ? simulation : new GasSimulation(25_000, 300, GAS_SPECIES.Argon, Math.random, 0.1e-6)
    if (preserveGasView) {
      // Reuse the model so the physical renderer keeps its camera and pan target.
      nextSimulation.setBrownianObject(false)
      nextSimulation.setMass(GAS_SPECIES.Argon, false)
      nextSimulation.setBoxLength(0.1e-6)
      nextSimulation.targetTemperature = 300
      nextSimulation.resizeParticleCount(25_000)
      nextSimulation.reset(300)
    }
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
    setDiffuseReflectionPercent(100)
    setThermalBathMode('all')
    setPrimaryWallAxis(0)
    setPrimaryWallPositive(true)
    setSecondaryWallAxis(0)
    setSecondaryWallPositive(false)
    setSecondaryWallTemperature(300)
    setSecondaryWallMatchesMain(true)
    setDsmcEnabled(true)
    setCollisionDiameterAngstrom(COLLISION_DIAMETERS_ANGSTROM.Argon)
    setParticleMarkerDiameterAngstrom(COLLISION_DIAMETERS_ANGSTROM.Argon)
    setMatchMarkerToCollisionDiameter(true)
    setParticleOcclusionEnabled(false)
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
    setMomentumPointSize(1)
    setMomentumViewResetKey((value) => value + 1)
    setBrownianEnabled(false)
    setBrownianDiameterAngstrom(100)
    setBrownianMassAmu(1e4)
    setBrownianFocus(false)
    setShowInfo(false)
    setStats(nextSimulation.statistics())
  }

  const advanceWalkthrough = () => {
    const next = walkthroughReducer(walkthrough, { type: 'next' })
    if (next.step !== walkthrough.step && WALKTHROUGH_STEPS[next.step].id !== 'finish') resetSimulationOptions(true)
    if (next !== walkthrough && WALKTHROUGH_STEPS[next.step].tasks[next.task].id === 'occlusion') {
      setBoxLengthMicrometers(0.1)
      simulation.setBoxLength(0.1e-6)
      setCollisionDiameterAngstrom(20)
      setParticleMarkerDiameterAngstrom(20)
      setMatchMarkerToCollisionDiameter(true)
      setParticleOcclusionEnabled(false)
    }
    dispatchWalkthrough({ type: 'next' })
  }

  const toggleThermalBath = () => {
    setThermostatEnabled((value) => !value)
  }

  const selectThermalBathMode = (mode: ThermalBathMode) => {
    if (mode === 'one') completeTask('one-face')
    if (mode === 'two' && thermalBathMode !== 'two') {
      setSecondaryWallTemperature(temperature)
      setSecondaryWallMatchesMain(true)
    }
    setThermalBathMode(mode)
  }

  const selectPrimaryWallAxis = (axis: ThermalWallAxis) => {
    setPrimaryWallAxis(axis)
    if (axis === secondaryWallAxis && primaryWallPositive === secondaryWallPositive) {
      setSecondaryWallPositive(!primaryWallPositive)
    }
  }

  const togglePrimaryWallSign = () => {
    const nextPositive = !primaryWallPositive
    setPrimaryWallPositive(nextPositive)
    if (primaryWallAxis === secondaryWallAxis && nextPositive === secondaryWallPositive) {
      setSecondaryWallPositive(!nextPositive)
    }
  }

  const selectSecondaryWallAxis = (axis: ThermalWallAxis) => {
    setSecondaryWallAxis(axis)
    if (axis === primaryWallAxis) setSecondaryWallPositive(!primaryWallPositive)
  }

  const effectiveSecondaryWallTemperature = secondaryWallMatchesMain ? temperature : secondaryWallTemperature
  const thermalWalls = useMemo<ThermalWallContact[]>(() => {
    if (thermalBathMode === 'all') return []
    const walls: ThermalWallContact[] = [{
      axis: primaryWallAxis,
      positive: primaryWallPositive,
      temperature,
    }]
    if (thermalBathMode === 'two') {
      walls.push({
        axis: secondaryWallAxis,
        positive: secondaryWallPositive,
        temperature: effectiveSecondaryWallTemperature,
      })
    }
    return walls
  }, [effectiveSecondaryWallTemperature, primaryWallAxis, primaryWallPositive, secondaryWallAxis, secondaryWallPositive, temperature, thermalBathMode])

  const setUniformRmsSpeed = () => {
    simulation.setUniformRmsSpeed()
    completeTask('starting-condition')
    setStats(simulation.statistics())
  }

  const alignVelocities = (axis: 0 | 1 | 2) => {
    simulation.alignVelocitiesToAxis(axis)
    completeTask('starting-condition')
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
  const maximumBrownianDiameterAngstrom = Math.max(5, Math.min(500, boxLengthMicrometers * 1e4 * 0.8))
  const focusActive = highlightFast || highlightCold || highlightBand || trackParticle || (brownianEnabled && brownianFocus)
  return (
    <main className={`app-shell${keyboardNavigation ? ' keyboard-navigation' : ''}`} onPointerDownCapture={() => setKeyboardNavigation(false)}>
      <header className="topbar">
        <div className="brand-mark"><span /><i /><b /></div>
        <div className="brand-copy">
          <h1>Hedione&apos;s <em>Ideal Gas Simulator</em></h1>
          <p>CLASSICAL IDEAL GAS · 3D STATISTICAL MECHANICS</p>
        </div>
        <div className="topbar-meta">
          <span><i className="live-dot" /> LIVE MODEL</span>
          <button
            className={`info-button${walking && currentTask.id === 'information' ? ' walkthrough-current' : ''}`}
            onClick={() => showInfo ? closeInfo() : setShowInfo(true)}
            aria-label="Information about the simulation"
            aria-expanded={showInfo}
            aria-describedby={walking && currentTask.id === 'information' ? 'walkthrough-instructions' : undefined}
          >i</button>
          <button
            className={`header-reset-button${walking && currentTask.id === 'header-reset' ? ' walkthrough-current' : ''}`}
            type="button"
            aria-describedby={walking && currentTask.id === 'header-reset' ? 'walkthrough-instructions' : undefined}
            onClick={() => { resetSimulationOptions(); completeTask('header-reset') }}
          >RESET SIMULATION</button>
        </div>
      </header>

      {walkthrough.mode === 'choose' && (
        <EntryDialog onWalkthrough={() => dispatchWalkthrough({ type: 'start' })} onFullAccess={() => dispatchWalkthrough({ type: 'full' })} />
      )}

      <section className={`workspace${walking ? ' walkthrough-workspace' : ''}`}>
      {walking && (
        <aside className="walkthrough-guide" data-step={currentStep.id} aria-label="Walkthrough">
          <div className="walkthrough-copy">
            <span className="eyebrow">WALKTHROUGH · {walkthrough.step + 1} OF {WALKTHROUGH_STEPS.length} · TASK {walkthrough.task + 1} OF {currentStep.tasks.length}</span>
            <h2>{currentStep.title}</h2>
            <p id="walkthrough-instructions">{currentTask.prompt}</p>
            <span className="walkthrough-status" role="status">
              {walkthrough.completed ? lastStep && lastTask ? 'All tasks complete. You can now finish the walkthrough.' : `Task complete. Ready for the next ${lastTask ? 'module' : 'task'}.` : currentStep.id === 'zoom'
                ? `Zoom in: ${walkthrough.zoomedIn ? 'done' : 'to do'} · Zoom out: ${walkthrough.zoomedOut ? 'done' : 'to do'}`
                : 'Try the task above to continue.'}
            </span>
          </div>
          <div className="walkthrough-actions">
            <button type="button" className="walkthrough-next" disabled={!walkthrough.completed || showInfo} onClick={advanceWalkthrough}>
              {!lastTask ? 'NEXT TASK' : lastStep ? 'FINISH WALKTHROUGH' : 'NEXT MODULE'}
            </button>
            <button type="button" onClick={() => dispatchWalkthrough({ type: 'full' })}>FULL ACCESS NOW</button>
          </div>
        </aside>
      )}

      {showInfo && (
        <div className="info-modal-backdrop" role="presentation" onMouseDown={closeInfo}>
          <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="simulation-info-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="info-modal-close" onClick={closeInfo} aria-label="Close information">×</button>
            <span className="eyebrow">ABOUT THE MODEL</span>
            <h2 id="simulation-info-title">A microscopic laboratory for an ideal gas</h2>
            <p>This browser simulation follows a three-dimensional ensemble of classical particles inside a controllable box. It connects individual trajectories and collisions to temperature, pressure, velocity distributions, mean free path, and flow regime.</p>
            <p>For more information, visit the <a href="https://github.com/Hedione/Ideal-Gas-Simulator" target="_blank" rel="noopener noreferrer">project on GitHub</a>.</p>
            <section className="info-shortcuts" aria-labelledby="keyboard-shortcuts-title">
              <h3 id="keyboard-shortcuts-title">Keyboard shortcuts</h3>
              <dl>
                <div><dt><kbd>Space</kbd></dt><dd>Pause / play simulation</dd></div>
                <div><dt><kbd>H</kbd></dt><dd>Toggle hot particle focus</dd></div>
                <div><dt><kbd>C</kbd></dt><dd>Toggle cold particle focus</dd></div>
                <div><dt><kbd>B</kbd></dt><dd>Toggle speed-band focus</dd></div>
                <div><dt><kbd>R</kbd></dt><dd>Toggle random particle tracking</dd></div>
                <div><dt><kbd>T</kbd></dt><dd>Toggle thermal bath</dd></div>
                <div><dt><kbd>O</kbd></dt><dd>Toggle particle occlusion</dd></div>
                <div><dt><kbd>+</kbd> / <kbd>−</kbd></dt><dd>Zoom focused particle view</dd></div>
              </dl>
            </section>
          </section>
        </div>
      )}

        <SimulationView
          onZoom={walking && currentStep.id === 'zoom' ? (direction) => dispatchWalkthrough({ type: 'zoom', direction }) : undefined}
          showDiagnostics={visible('population')}
          walkthroughCurrent={walking && currentStep.id === 'zoom'}
          simulation={simulation}
          playing={playing}
          speedMultiplier={speedMultiplier}
          thermostatEnabled={thermostatEnabled}
          diffuseReflectionProbability={diffuseReflectionPercent / 100}
          thermalBathMode={thermalBathMode}
          thermalWalls={thermalWalls}
          dsmcEnabled={dsmcEnabled}
          collisionDiameterAngstrom={collisionDiameterAngstrom}
          particleMarkerDiameterAngstrom={particleMarkerDiameterAngstrom}
          particleOcclusionEnabled={particleOcclusionEnabled}
          knudsenNumber={collisionTheory.knudsenNumber}
          brownianEnabled={brownianEnabled}
          brownianDiameterAngstrom={Math.min(brownianDiameterAngstrom, maximumBrownianDiameterAngstrom)}
          brownianMassAmu={brownianMassAmu}
          brownianFocus={brownianFocus}
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

        {visible('momentum') && <section id="walkthrough-momentum" tabIndex={-1} className={`momentum-panel ${showMomentumSpace ? 'active' : ''}${currentModuleClass('momentum')}`}>
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
            <>
              <MomentumSpaceView
                key={momentumViewResetKey}
                onOrbit={walking && currentTask.id === 'momentum-orbit' ? () => completeTask('momentum-orbit') : undefined}
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
                pointSize={momentumPointSize}
              />
              <label className="momentum-point-size-control">
                <span>POINT SIZE <b>{momentumPointSize.toFixed(1)}×</b></span>
                <input
                  type="range"
                  min="0.4"
                  max="3"
                  step="0.1"
                  value={momentumPointSize}
                  onChange={(event) => {
                    setMomentumPointSize(Number(event.target.value))
                    completeTask('momentum')
                  }}
                  onDoubleClick={() => setMomentumPointSize(1)}
                  title="Double-click to reset"
                />
              </label>
            </>
          ) : (
            <div className="momentum-disabled">
              <i aria-hidden="true" />
              <strong>3D VIEW DISABLED</strong>
              <p>Enable to render all particles in (p<sub>x</sub>, p<sub>y</sub>, p<sub>z</sub>) space.</p>
              <button onClick={() => setShowMomentumSpace(true)}>ENABLE MOMENTUM SPACE</button>
            </div>
          )}
        </section>}

        {visible('distribution') && <section id="walkthrough-distribution" tabIndex={-1} className={`analysis-panel${currentModuleClass('distribution')}`}>
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
              <input type="range" min="20" max="100" step="5" value={bins} onChange={(event) => { setBins(Number(event.target.value)); completeTask('distribution') }} onDoubleClick={() => setBins(100)} title="Double-click to reset" />
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
        </section>}
      </section>

      <section className={`control-deck${walking ? ' walkthrough-deck' : ''}`}>
        {visible('simulation') && <div id="walkthrough-simulation" tabIndex={0} role="region" aria-labelledby="simulation-controls-title" className={`playback-block${currentModuleClass('simulation')}`}>
          <span id="simulation-controls-title" className="control-title">SIMULATION</span>
          <div className="transport">
            <div className="transport-actions">
              <button className="primary-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'} aria-keyshortcuts="Space" title="Pause / play (Space)">
                {playing ? 'Ⅱ' : '▶'}
              </button>
              <button onClick={reset} aria-label="Reset simulation">↻</button>
            </div>
            <div className="transport-features">
              <button
                type="button"
                className={`transport-toggle particle-occlusion-button ${particleOcclusionEnabled ? 'active' : ''}`}
                aria-label="Particle occlusion"
                aria-pressed={particleOcclusionEnabled}
                aria-keyshortcuts="O"
                title="Toggle particle occlusion (O): nearer particles hide those behind them"
                onClick={toggleParticleOcclusion}
              >
                <b>OCCLUSION</b>
                <span>{particleOcclusionEnabled ? 'ON' : 'OFF'}</span>
              </button>
              <button
                type="button"
                className={`transport-toggle transport-collisions ${dsmcEnabled ? 'active' : ''}`}
                aria-pressed={dsmcEnabled}
                onClick={() => setDsmcEnabled((value) => !value)}
              >
                <b>COLLISIONS</b>
                <span>{dsmcEnabled ? 'ON' : 'OFF'} · DSMC</span>
              </button>
            </div>
          </div>
          <label className="compact-slider">
            <span>
              TIME SCALE
              <span className="time-scale-values">
                <small>{formatSimulationRate(speedMultiplier)}</small>
                <b>{speedMultiplier < 0.1 ? speedMultiplier.toFixed(2) : speedMultiplier.toFixed(1)}×</b>
              </span>
            </span>
            <input
              type="range"
              min="-2"
              max={Math.log10(10)}
              step="0.05"
              value={Math.log10(speedMultiplier)}
              onChange={(event) => {
                const value = 10 ** Number(event.target.value)
                setSpeedMultiplier(value)
                if (value > 1) completeTask('speed-up')
                if (value < 1) completeTask('slow-down')
              }}
              onDoubleClick={() => setSpeedMultiplier(1)}
              title="Double-click to reset"
            />
            <span className="slider-endpoints"><i>0.01×</i><i>Log Scale</i><i>10×</i></span>
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
            <span className="slider-endpoints"><i>0.01 μm</i><i>Log Scale</i><i>1.00 μm</i></span>
          </label>
          <div className="starting-conditions">
            <span>STARTING CONDITIONS</span>
            <div className="starting-condition-grid">
              <button onClick={setUniformRmsSpeed} title="Give every particle the ensemble RMS speed while preserving total kinetic energy and direction">
                <b>RMS SPEED</b>
              </button>
              <button onClick={() => alignVelocities(0)} title="Align every velocity with the positive or negative x axis">
                <b>X-ALIGNED</b>
              </button>
              <button onClick={() => alignVelocities(1)} title="Align every velocity with the positive or negative y axis">
                <b>Y-ALIGNED</b>
              </button>
              <button onClick={() => alignVelocities(2)} title="Align every velocity with the positive or negative z axis">
                <b>Z-ALIGNED</b>
              </button>
            </div>
          </div>
          <div className="brownian-controls">
            <span>BROWNIAN MOTION</span>
            <button
              type="button"
              className={`brownian-master ${brownianEnabled ? 'active' : ''}`}
              aria-pressed={brownianEnabled}
              onClick={() => {
                if (brownianEnabled) setBrownianFocus(false)
                setBrownianEnabled(!brownianEnabled)
              }}
            >
              <b>MASSIVE TRACER {brownianEnabled ? 'INSERTED' : 'OFF'}</b>
              <small>{brownianEnabled ? 'elastic gas impacts drive its motion' : 'insert a hard sphere into the gas'}</small>
            </button>
            {brownianEnabled && (
              <div className="brownian-settings">
                <label>
                  <span>TRACER DIAMETER <b>{brownianDiameterAngstrom.toFixed(0)} Å</b></span>
                  <input
                    type="range"
                    min="5"
                    max={maximumBrownianDiameterAngstrom}
                    step="1"
                    value={brownianDiameterAngstrom}
                    onChange={(event) => setBrownianDiameterAngstrom(Number(event.target.value))}
                    onDoubleClick={() => setBrownianDiameterAngstrom(Math.min(100, maximumBrownianDiameterAngstrom))}
                    title="Double-click to reset"
                  />
                  <small>5 Å · max {maximumBrownianDiameterAngstrom.toFixed(0)} Å for this box</small>
                </label>
                <label>
                  <span>TRACER MASS <b>{brownianMassAmu.toExponential(1)} u</b></span>
                  <input
                    type="range"
                    min="3"
                    max="9"
                    step="0.1"
                    value={Math.log10(brownianMassAmu)}
                    onChange={(event) => setBrownianMassAmu(10 ** Number(event.target.value))}
                    onDoubleClick={() => setBrownianMassAmu(1e4)}
                    title="Logarithmic mass scale · double-click to reset"
                  />
                  <small><span>10³ u</span><span>Log Scale</span><span>10⁹ u</span></small>
                </label>
                <button
                  type="button"
                  className={`brownian-focus-button ${brownianFocus ? 'active' : ''}`}
                  aria-pressed={brownianFocus}
                  onClick={() => setBrownianFocus((value) => !value)}
                >
                  <b>DIM GAS {brownianFocus ? 'ON' : 'OFF'}</b>
                  <small>{brownianFocus ? 'tracer emphasized' : 'normal gas opacity'}</small>
                </button>
              </div>
            )}
          </div>
        </div>}

        {visible('temperature') && <div id="walkthrough-temperature" tabIndex={0} role="region" aria-labelledby="temperature-controls-title" className={`control-block temperature-block${currentModuleClass('temperature')}`}>
          <span id="temperature-controls-title" className="control-title">TEMPERATURE</span>
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
          <input className="wide-slider" type="range" min="0" max="3" step="0.001" value={Math.log10(temperature / 5)} onChange={(event) => applyTemperature(Math.round(5 * 10 ** Number(event.target.value)))} onDoubleClick={() => applyTemperature(300)} aria-label="Target temperature" aria-valuemin={5} aria-valuemax={5000} aria-valuenow={temperature} aria-valuetext={`${temperature} kelvin, logarithmic scale`} title="Logarithmic temperature scale · double-click to reset" />
          <div className="range-labels"><span>5 K</span><span>Log Scale</span><span>5,000 K</span></div>
          <button
            type="button"
            className={`thermal-bath-master ${thermostatEnabled ? 'active' : ''}`}
            aria-keyshortcuts="T"
            aria-pressed={thermostatEnabled}
            onClick={toggleThermalBath}
          >
            <b>THERMAL BATH {thermostatEnabled ? 'ON' : 'OFF'}</b>
            <span>{thermostatEnabled
              ? diffuseReflectionPercent > 0
                ? 'wall-mediated heat exchange enabled'
                : '0% diffuse reflection · walls remain specular'
              : 'all walls perfectly elastic'}</span>
          </button>
          <div className="thermal-bath-modes" role="group" aria-label="Number of thermal faces">
            {(['all', 'one', 'two'] as ThermalBathMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={thermalBathMode === mode ? 'selected' : ''}
                aria-pressed={thermalBathMode === mode}
                disabled={!thermostatEnabled}
                onClick={() => selectThermalBathMode(mode)}
              >
                {mode === 'all' ? 'ALL FACES' : mode === 'one' ? 'ONE FACE' : 'TWO FACES'}
              </button>
            ))}
          </div>
          <label className={`bath-rate ${thermostatEnabled ? '' : 'disabled'}`}>
            <span>DIFFUSE REFLECTION PROBABILITY <b>{diffuseReflectionPercent}%</b></span>
            <input type="range" min="0" max="100" step="1" disabled={!thermostatEnabled} value={diffuseReflectionPercent} onChange={(event) => setDiffuseReflectionPercent(Number(event.target.value))} onDoubleClick={() => setDiffuseReflectionPercent(100)} title="0% specular · 100% complete thermal resampling · double-click to reset" />
            <small>0% SPECULAR · 100% COMPLETE RESAMPLING</small>
          </label>
          {thermostatEnabled && thermalBathMode !== 'all' && (
            <div className="thermal-face-config">
              <span>THERMAL FACE 1</span>
              <div className="thermal-face-selector" role="group" aria-label="First thermal face">
                <button type="button" className="sign" onClick={togglePrimaryWallSign} aria-label="Toggle first face sign">{primaryWallPositive ? '+' : '−'}</button>
                {(['X', 'Y', 'Z'] as const).map((axisLabel, axis) => (
                  <button
                    key={axisLabel}
                    type="button"
                    className={primaryWallAxis === axis ? 'selected' : ''}
                    aria-pressed={primaryWallAxis === axis}
                    onClick={() => selectPrimaryWallAxis(axis as ThermalWallAxis)}
                  >
                    {axisLabel}
                  </button>
                ))}
              </div>
            </div>
          )}
          {thermostatEnabled && thermalBathMode === 'two' && (
            <div className="secondary-wall-config">
              <div className="thermal-face-config">
                <span>THERMAL FACE 2</span>
                <div className="thermal-face-selector" role="group" aria-label="Second thermal face">
                  <button
                    type="button"
                    className="sign"
                    disabled={secondaryWallAxis === primaryWallAxis}
                    onClick={() => setSecondaryWallPositive((value) => !value)}
                    aria-label="Toggle second face sign"
                    title={secondaryWallAxis === primaryWallAxis ? 'Opposite sign required when both faces share an axis' : undefined}
                  >
                    {secondaryWallPositive ? '+' : '−'}
                  </button>
                  {(['X', 'Y', 'Z'] as const).map((axisLabel, axis) => (
                    <button
                      key={axisLabel}
                      type="button"
                      className={secondaryWallAxis === axis ? 'selected' : ''}
                      aria-pressed={secondaryWallAxis === axis}
                      onClick={() => selectSecondaryWallAxis(axis as ThermalWallAxis)}
                    >
                      {axisLabel}
                    </button>
                  ))}
                </div>
              </div>
              <div className="secondary-temperature-heading">
                <span>FACE 2 TEMPERATURE <b>{effectiveSecondaryWallTemperature.toLocaleString()} K</b></span>
                <button
                  type="button"
                  className={secondaryWallMatchesMain ? 'matching' : ''}
                  aria-pressed={secondaryWallMatchesMain}
                  onClick={() => {
                    if (secondaryWallMatchesMain) setSecondaryWallTemperature(temperature)
                    setSecondaryWallMatchesMain((value) => !value)
                  }}
                >
                  {secondaryWallMatchesMain ? 'DISABLE MATCHING' : 'MATCH MAIN TEMP'}
                </button>
              </div>
              <input
                className="wide-slider secondary-temperature-slider"
                type="range"
                min="0"
                max="3"
                step="0.001"
                disabled={secondaryWallMatchesMain}
                value={Math.log10(effectiveSecondaryWallTemperature / 5)}
                onChange={(event) => setSecondaryWallTemperature(Math.round(5 * 10 ** Number(event.target.value)))}
                onDoubleClick={() => {
                  setSecondaryWallTemperature(temperature)
                  setSecondaryWallMatchesMain(true)
                }}
                aria-label="Second wall temperature"
                aria-valuemin={5}
                aria-valuemax={5000}
                aria-valuenow={effectiveSecondaryWallTemperature}
                aria-valuetext={`${effectiveSecondaryWallTemperature} kelvin, logarithmic scale`}
                title="Logarithmic temperature scale · double-click to match the main temperature"
              />
              <div className="range-labels"><span>5 K</span><span>Log Scale</span><span>5,000 K</span></div>
            </div>
          )}
        </div>}

        {visible('population') && <div id="walkthrough-population" tabIndex={0} role="region" aria-labelledby="population-controls-title" className={`control-block gas-population-block${currentModuleClass('population')}`}>
          <span id="population-controls-title" className="control-title">GAS & PARTICLE POPULATION</span>
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
                  max="50"
                  step="0.1"
                  value={particleMarkerDiameterAngstrom}
                  onChange={(event) => applyParticleMarkerDiameter(Number(event.target.value))}
                  onDoubleClick={() => {
                    setParticleMarkerDiameterAngstrom(collisionDiameterAngstrom)
                    setMatchMarkerToCollisionDiameter(true)
                  }}
                  title="Double-click to match collision diameter"
                />
                <span className="slider-endpoints"><i>0.1 Å</i><i>50 Å</i></span>
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
          <small className="physical-scale-note">Rendered to physical scale relative to the box; independent of particle count.</small>
        </div>}

        {visible('focus') && <div id="walkthrough-focus" tabIndex={0} role="region" aria-labelledby="focus-controls-title" className={`control-block focus-block${currentModuleClass('focus')}`}>
          <span id="focus-controls-title" className="control-title">PARTICLE FOCUS & TRACKING</span>
          <div className="focus-button-grid">
            <button className={`focus-button hot ${highlightFast ? 'active' : ''}`} aria-pressed={highlightFast} aria-keyshortcuts="H" title="Toggle hot particle focus (H)" onClick={() => toggleFocus('hot')}><b>HOT</b><span>above cutoff</span></button>
            <button className={`focus-button cold ${highlightCold ? 'active' : ''}`} aria-pressed={highlightCold} aria-keyshortcuts="C" title="Toggle cold particle focus (C)" onClick={() => toggleFocus('cold')}><b>COLD</b><span>below cutoff</span></button>
            <button className={`focus-button band ${highlightBand ? 'active' : ''}`} aria-pressed={highlightBand} aria-keyshortcuts="B" title="Toggle speed-band focus (B)" onClick={() => toggleFocus('band')}><b>BAND</b><span>speed window</span></button>
            <button className={`focus-button random ${trackParticle ? 'active' : ''}`} aria-pressed={trackParticle} aria-keyshortcuts="R" title="Toggle random particle tracking (R)" onClick={() => toggleFocus('random')}><b>RANDOM</b><span>single atom</span></button>
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
        </div>}

      </section>

      <footer>
        <p><strong>MODEL:</strong> {dsmcEnabled ? 'dilute hard-sphere DSMC gas with elastic binary collisions' : 'nonrelativistic, collisionless ideal gas with perfectly elastic walls'}</p>
        <p>Thermal momentum exchange occurs only at wall contacts. One- and two-face modes use the highlighted selected walls; DSMC handles particle collisions.</p>
      </footer>
    </main>
  )
}

export default App
