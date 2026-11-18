import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHistogram, characteristicMaxSpeed, GasSimulation, theoreticalRmsSpeed } from '../physics'
import { DistributionChart } from './DistributionChart'

interface ChartState {
  data: { datasets: { label: string; data: { x: number; y: number }[] }[] }
  options: { scales: { x: { max: number }; y: { max: number; ticks: { callback: (value: number | string) => string } } } }
  update: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const harness = vi.hoisted(() => ({ chart: undefined as ChartState | undefined, cleanup: undefined as (() => void) | void }))

vi.mock('react', () => ({
  useRef: (initial: unknown) => ({ current: initial ?? {} }),
  useEffect: (setup: () => (() => void) | void) => { harness.cleanup = setup() },
}))

vi.mock('chart.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('chart.js')>(),
  Chart: class {
    static register() {}
    constructor(_canvas: unknown, configuration: ChartState) {
      harness.chart = { ...configuration, update: vi.fn(), destroy: vi.fn() }
      return harness.chart
    }
  },
}))

function mountChart() {
  let seed = 12345
  const simulation = new GasSimulation(25_000, 300, 39.948, () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 0x100000000
  })
  const props = {
    simulation, bins: 100, highlightFast: false, speedThreshold: 750,
    highlightCold: false, coldSpeedThreshold: 100,
    highlightBand: false, bandCenter: 400, bandHalfWidth: 10,
  }
  DistributionChart(props)
  return { props, simulation, chart: harness.chart! }
}

function rawDensity(simulation: GasSimulation, bins: number) {
  return buildHistogram(simulation.speeds, bins, characteristicMaxSpeed(simulation.targetTemperature, simulation.massAmu)).density
}

describe('live distribution display', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      setInterval, clearInterval,
    })
  })

  afterEach(() => {
    harness.cleanup?.()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('keeps the y scale and marker heights steady while live samples change', () => {
    const { chart, simulation } = mountChart()
    const yMaximum = chart.options.scales.y.max
    const markerHeight = chart.data.datasets[2].data[1].y
    const original = chart.data.datasets[0].data.map(({ y }) => y)
    const initialUpdateCount = chart.update.mock.calls.length
    const binWidth = characteristicMaxSpeed(300, 39.948) / 100
    simulation.speeds[0] += binWidth * 2
    const raw = rawDensity(simulation, 100)
    vi.advanceTimersByTime(250)
    const displayed = chart.data.datasets[0].data.map(({ y }) => y)
    expect(displayed).not.toEqual(original)
    const changedBin = raw.findIndex((value, i) => value !== original[i])
    expect(displayed[changedBin]).toBeCloseTo(original[changedBin] + 0.25 * (raw[changedBin] - original[changedBin]), 12)
    vi.advanceTimersByTime(5000)
    expect(chart.options.scales.y.max).toBe(yMaximum)
    expect(chart.data.datasets[2].data[1].y).toBe(markerHeight)
    expect(chart.update.mock.calls.length).toBeGreaterThan(initialUpdateCount + 1)
    const integral = displayed.reduce((sum, value) => sum + value * binWidth, 0)
    expect(integral).toBeCloseTo(raw.reduce((sum, value) => sum + value * binWidth, 0), 12)
  })

  it('still accommodates a sharp nonequilibrium peak and its later relaxation', () => {
    const { chart, simulation } = mountChart()
    const equilibriumSpeeds = simulation.speeds.slice()
    const equilibriumMaximum = chart.options.scales.y.max
    simulation.speeds.fill(theoreticalRmsSpeed(300, 39.948))
    vi.advanceTimersByTime(5000)
    const peakMaximum = chart.options.scales.y.max
    expect(peakMaximum).toBeGreaterThan(equilibriumMaximum * 2)
    expect(Math.max(...chart.data.datasets[0].data.map(({ y }) => y))).toBeLessThanOrEqual(peakMaximum)
    simulation.speeds.set(equilibriumSpeeds)
    vi.advanceTimersByTime(15000)
    expect(chart.options.scales.y.max).toBeLessThan(peakMaximum / 2)
    const settledMaximum = chart.options.scales.y.max
    vi.advanceTimersByTime(5000)
    expect(chart.options.scales.y.max).toBe(settledMaximum)
  })

  it('discards old display samples when bins, temperature, mass, population, or experiment change', () => {
    const { chart, simulation, props } = mountChart()
    const changes = [
      () => { props.bins = 20 },
      () => { simulation.targetTemperature = 600 },
      () => { simulation.setMass(4, true) },
      () => { simulation.resizeParticleCount(1000) },
      () => { simulation.elapsedTime = 1 },
      () => { simulation.reset() },
      () => { props.simulation = new GasSimulation(1000, 300, 39.948) },
    ]
    for (const change of changes) {
      change()
      vi.advanceTimersByTime(250)
      expect(chart.data.datasets[0].data.map(({ y }) => y)).toEqual(rawDensity(props.simulation, props.bins))
      expect(chart.options.scales.y.max).toBeGreaterThan(0)
    }
    expect(chart.data.datasets[1].data.some(({ y }) => y > 0)).toBe(true)
  })

  it('labels zero plainly and retains scientific notation for nonzero densities', () => {
    const { chart } = mountChart()
    const format = chart.options.scales.y.ticks.callback
    expect(format(0)).toBe('0')
    expect(format('0')).toBe('0')
    expect(format(0.002)).toBe('2.0e-3')
  })
})
