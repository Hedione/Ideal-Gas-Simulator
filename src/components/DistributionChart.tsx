import { useEffect, useRef } from 'react'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import {
  buildHistogram,
  characteristicMaxSpeed,
  GasSimulation,
  maxwellBoltzmannDensity,
  mostProbableSpeed,
  theoreticalMeanSpeed,
  theoreticalRmsSpeed,
} from '../physics'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip, Legend)

interface DistributionChartProps {
  simulation: GasSimulation
  bins: number
  highlightFast: boolean
  speedThreshold: number
  highlightCold: boolean
  coldSpeedThreshold: number
  highlightBand: boolean
  bandCenter: number
  bandHalfWidth: number
}

export function DistributionChart(props: DistributionChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const settingsRef = useRef(props)
  settingsRef.current = props

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const chart = new Chart(canvas, {
      type: 'bar',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        normalized: true,
        interaction: { intersect: false, mode: 'nearest' },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { color: '#9eb2bd', boxWidth: 18, usePointStyle: true, font: { size: 10 } } },
          tooltip: {
            backgroundColor: '#0b1820', borderColor: '#25434e', borderWidth: 1,
            callbacks: { label: (context) => `${context.dataset.label}: ${Number(context.parsed.y).toExponential(3)} s/m` },
          },
        },
        scales: {
          x: {
            type: 'linear', min: 0,
            title: { display: true, text: 'SPEED (m/s)', color: '#78909b', font: { size: 10, weight: 600 } },
            ticks: { color: '#78909b', maxTicksLimit: 7 },
            grid: { color: 'rgba(114, 151, 164, 0.08)' },
            border: { color: 'rgba(114, 151, 164, 0.18)' },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'PROBABILITY DENSITY (s/m)', color: '#78909b', font: { size: 10, weight: 600 } },
            ticks: { color: '#78909b', maxTicksLimit: 6, callback: (value) => Number(value).toExponential(1) },
            grid: { color: 'rgba(114, 151, 164, 0.08)' },
            border: { color: 'rgba(114, 151, 164, 0.18)' },
          },
        },
      },
    })

    const update = () => {
      const {
        simulation,
        bins,
        highlightFast,
        speedThreshold,
        highlightCold,
        coldSpeedThreshold,
        highlightBand,
        bandCenter,
        bandHalfWidth,
      } = settingsRef.current
      const maxSpeed = characteristicMaxSpeed(simulation.targetTemperature, simulation.massAmu)
      const histogram = buildHistogram(simulation.speeds, bins, maxSpeed)
      const maxDensity = Math.max(...histogram.density)
      const curve = Array.from({ length: 181 }, (_, i) => {
        const x = (i / 180) * maxSpeed
        return { x, y: maxwellBoltzmannDensity(x, simulation.targetTemperature, simulation.massAmu) }
      })
      const marker = (label: string, x: number, color: string) => ({
        type: 'line' as const, label, data: [{ x, y: 0 }, { x, y: maxDensity * 1.12 }],
        borderColor: color, borderWidth: 1, borderDash: [4, 4], pointRadius: 0, order: 0,
      })
      chart.data.datasets = [
        {
          type: 'bar', label: 'Simulated',
          data: histogram.centers.map((x, i) => ({ x, y: histogram.density[i] })),
          backgroundColor: 'rgba(33, 190, 210, 0.42)', borderColor: 'rgba(68, 218, 232, 0.72)',
          borderWidth: 0.7, barPercentage: 1, categoryPercentage: 1, order: 2,
        },
        {
          type: 'line' as const, label: 'Maxwell–Boltzmann', data: curve,
          borderColor: '#ffb547', backgroundColor: 'transparent', borderWidth: 2.2,
          pointRadius: 0, tension: 0.28, order: 1,
        },
        marker('Most probable', mostProbableSpeed(simulation.targetTemperature, simulation.massAmu), '#8ee6ff'),
        marker('Mean', theoreticalMeanSpeed(simulation.targetTemperature, simulation.massAmu), '#d2f88d'),
        marker('RMS', theoreticalRmsSpeed(simulation.targetTemperature, simulation.massAmu), '#ff8296'),
        ...(highlightCold ? [marker(`Cold cutoff (${coldSpeedThreshold} m/s)`, coldSpeedThreshold, '#1eb7ff')] : []),
        ...(highlightFast ? [marker(`Hot cutoff (${speedThreshold} m/s)`, speedThreshold, '#ff851f')] : []),
        ...(highlightBand ? [
          marker(`Band lower (${Math.max(0, bandCenter - bandHalfWidth)} m/s)`, Math.max(0, bandCenter - bandHalfWidth), '#78e6aa'),
          marker(`Band upper (${bandCenter + bandHalfWidth} m/s)`, bandCenter + bandHalfWidth, '#78e6aa'),
        ] : []),
      ] as never
      if (chart.options.scales?.x) chart.options.scales.x.max = maxSpeed
      chart.update('none')
    }
    update()
    const interval = window.setInterval(update, 140)
    return () => {
      window.clearInterval(interval)
      chart.destroy()
    }
  }, [])

  return <div className="chart-wrap"><canvas ref={canvasRef} /></div>
}
