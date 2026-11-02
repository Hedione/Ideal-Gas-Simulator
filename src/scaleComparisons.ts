export type ScaleComparisonShape =
  | 'red-blood-cell'
  | 'bacterium'
  | 'coronavirus'
  | 'dna'
  | 'buckyball'
  | 'platelet'
  | 'atp-synthase'
  | 'carbon-nanotube'

export interface ScaleComparison {
  id: ScaleComparisonShape
  label: string
  sizeMeters: number
  sizeLabel: string
  measurement: string
}

export const SCALE_COMPARISONS: ScaleComparison[] = [
  {
    id: 'red-blood-cell',
    label: 'Red blood cell',
    sizeMeters: 7.5e-6,
    sizeLabel: '7.5 µm',
    measurement: 'diameter',
  },
  {
    id: 'bacterium',
    label: 'E. coli bacterium',
    sizeMeters: 2e-6,
    sizeLabel: '2.0 µm',
    measurement: 'length',
  },
  {
    id: 'platelet',
    label: 'Blood platelet',
    sizeMeters: 2.5e-6,
    sizeLabel: '2.5 µm',
    measurement: 'diameter',
  },
  {
    id: 'coronavirus',
    label: 'Coronavirus',
    sizeMeters: 100e-9,
    sizeLabel: '100 nm',
    measurement: 'core diameter',
  },
  {
    id: 'atp-synthase',
    label: 'ATP synthase',
    sizeMeters: 10e-9,
    sizeLabel: '10 nm',
    measurement: 'head diameter',
  },
  {
    id: 'dna',
    label: 'DNA double helix',
    sizeMeters: 2e-9,
    sizeLabel: '2 nm',
    measurement: 'diameter',
  },
  {
    id: 'carbon-nanotube',
    label: 'Carbon nanotube',
    sizeMeters: 1.3e-9,
    sizeLabel: '1.3 nm',
    measurement: 'diameter',
  },
  {
    id: 'buckyball',
    label: 'C₆₀ buckyball',
    sizeMeters: 1e-9,
    sizeLabel: '1 nm',
    measurement: 'diameter',
  },
]

export type ScaleComparisonId = 'none' | ScaleComparisonShape

export function getScaleComparison(id: ScaleComparisonId): ScaleComparison | undefined {
  return SCALE_COMPARISONS.find((comparison) => comparison.id === id)
}

export function formatScaleRatio(ratio: number): string {
  if (ratio >= 1000) return `${ratio.toExponential(2)}×`
  if (ratio >= 100) return `${ratio.toFixed(0)}×`
  if (ratio >= 10) return `${ratio.toFixed(1)}×`
  if (ratio >= 1) return `${ratio.toFixed(2)}×`
  if (ratio >= 0.01) return `${ratio.toFixed(3)}×`
  return `${ratio.toExponential(2)}×`
}
