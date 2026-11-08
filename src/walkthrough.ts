export const WALKTHROUGH_STEPS = [
  { id: 'zoom', title: 'Explore the particle simulation', tasks: [
    { id: 'zoom', prompt: 'Zoom in to see particles up close, then zoom out to see the box. Scroll or pinch, or focus the particle view and press + / −.' },
  ] },
  { id: 'population', title: 'Gas & particle population', tasks: [
    { id: 'population', prompt: 'Change PARTICLE COUNT to add or remove gas molecules. Watch the live particle field respond.' },
    { id: 'collision-diameter', prompt: 'Increase COLLISION DIAMETER and watch what happens in the chamber. With marker matching on, the visible particles also grow.' },
  ] },
  { id: 'simulation', title: 'Control the simulation', tasks: [
    { id: 'speed-up', prompt: 'Increase TIME SCALE above 1× to speed up the simulation. Watch the particles move faster.' },
    { id: 'slow-down', prompt: 'Now reduce TIME SCALE below 1× to slow down the simulation and inspect the motion.' },
    { id: 'box-size', prompt: 'Change BOX SIDE LENGTH and observe how the chamber scale and gas density change.' },
    { id: 'starting-condition', prompt: 'Scroll down to STARTING CONDITIONS and try RMS SPEED, X-ALIGNED, Y-ALIGNED, or Z-ALIGNED. Watch the gas relax from the chosen state.' },
    { id: 'occlusion', prompt: 'The box is now 0.10 μm wide, with collision and marker diameters at 20 Å. Scroll to the top of SIMULATION and turn OCCLUSION on between Reset and Collisions. Compare how nearer particles hide those behind them.' },
  ] },
  { id: 'temperature', title: 'Temperature & thermal walls', tasks: [
    { id: 'heat', prompt: 'Increase the target temperature to at least 500 K. Watch the gas gain energy through thermal wall contacts.' },
    { id: 'one-face', prompt: 'Select ONE FACE in the thermal-wall controls. Heat exchange will now occur only at the selected face.' },
    { id: 'cool', prompt: 'Keep ONE FACE selected and reduce the target temperature below 10 K. Observe how the gas cools through contacts with that wall.' },
  ] },
  { id: 'momentum', title: 'Explore momentum space', tasks: [
    { id: 'momentum', prompt: 'Adjust POINT SIZE beneath the momentum cloud. Each point represents the momentum of a gas particle.' },
    { id: 'momentum-orbit', prompt: 'Drag the momentum cloud to explore it in 3D.' },
  ] },
  { id: 'distribution', title: 'Read the speed distribution', tasks: [
    { id: 'distribution', prompt: 'Change HISTOGRAM BINS to regroup the measured speeds. Compare the histogram with the Maxwell–Boltzmann curve.' },
  ] },
  { id: 'focus', title: 'Focus & track particles', tasks: [
    { id: 'focus', prompt: 'Enable HOT, COLD, BAND, or RANDOM to highlight a group of particles or follow a single atom.' },
  ] },
  { id: 'finish', title: 'Ready to explore', tasks: [
    { id: 'header-reset', prompt: 'Press RESET SIMULATION in the top-right corner to restore the default experiment.' },
    { id: 'information', prompt: 'Open the i information button at the top right for more information about the model and keyboard shortcuts. Close the information page, then click Finish walkthrough.' },
  ] },
] as const

export type WalkthroughModule = typeof WALKTHROUGH_STEPS[number]['id']
export type WalkthroughTask = typeof WALKTHROUGH_STEPS[number]['tasks'][number]['id']

interface WalkthroughState {
  mode: 'choose' | 'walkthrough' | 'full'
  step: number
  task: number
  completed: boolean
  zoomedIn: boolean
  zoomedOut: boolean
}

type WalkthroughAction =
  | { type: 'start' }
  | { type: 'full' }
  | { type: 'zoom'; direction: 'in' | 'out' }
  | { type: 'interact'; task: WalkthroughTask }
  | { type: 'next' }

export const initialWalkthrough: WalkthroughState = {
  mode: 'choose', step: 0, task: 0, completed: false, zoomedIn: false, zoomedOut: false,
}

export function walkthroughReducer(state: WalkthroughState, action: WalkthroughAction): WalkthroughState {
  if (action.type === 'start') return { ...initialWalkthrough, mode: 'walkthrough' }
  if (action.type === 'full') return { ...state, mode: 'full' }
  if (state.mode !== 'walkthrough') return state
  if (state.completed && action.type !== 'next') return state

  const current = WALKTHROUGH_STEPS[state.step]
  if (action.type === 'zoom' && current.id === 'zoom') {
    const zoomedIn = state.zoomedIn || action.direction === 'in'
    const zoomedOut = state.zoomedOut || action.direction === 'out'
    return { ...state, zoomedIn, zoomedOut, completed: zoomedIn && zoomedOut }
  }
  if (action.type === 'interact' && current.id !== 'zoom' && action.task === current.tasks[state.task].id) {
    return { ...state, completed: true }
  }
  if (action.type === 'next' && state.completed) {
    if (state.task < current.tasks.length - 1) return { ...state, task: state.task + 1, completed: false }
    if (state.step === WALKTHROUGH_STEPS.length - 1) return { ...state, mode: 'full' }
    return { ...state, step: state.step + 1, task: 0, completed: false }
  }
  return state
}

export function isModuleVisible(state: WalkthroughState, module: WalkthroughModule): boolean {
  return state.mode !== 'walkthrough' || WALKTHROUGH_STEPS.findIndex((step) => step.id === module) <= state.step
}
