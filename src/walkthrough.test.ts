import { describe, expect, it } from 'vitest'
import { initialWalkthrough, isModuleVisible, WALKTHROUGH_STEPS, walkthroughReducer, WalkthroughTask } from './walkthrough'

function startPopulation() {
  let state = walkthroughReducer(initialWalkthrough, { type: 'start' })
  state = walkthroughReducer(state, { type: 'zoom', direction: 'in' })
  state = walkthroughReducer(state, { type: 'zoom', direction: 'out' })
  return walkthroughReducer(state, { type: 'next' })
}

describe('walkthrough progression', () => {
  it('offers a fresh choice and lets full access expose every module immediately', () => {
    expect(initialWalkthrough.mode).toBe('choose')
    const state = walkthroughReducer(initialWalkthrough, { type: 'full' })
    expect(state.mode).toBe('full')
    for (const step of WALKTHROUGH_STEPS) expect(isModuleVisible(state, step.id)).toBe(true)
  })

  it('requires both zoom directions before revealing population', () => {
    let state = walkthroughReducer(initialWalkthrough, { type: 'start' })
    expect(WALKTHROUGH_STEPS.filter((step) => isModuleVisible(state, step.id)).map((step) => step.id)).toEqual(['zoom'])
    expect(walkthroughReducer(state, { type: 'next' })).toBe(state)
    expect(walkthroughReducer(state, { type: 'interact', task: 'zoom' })).toBe(state)
    state = walkthroughReducer(state, { type: 'zoom', direction: 'out' })
    state = walkthroughReducer(state, { type: 'zoom', direction: 'out' })
    expect(state.completed).toBe(false)
    state = walkthroughReducer(state, { type: 'zoom', direction: 'in' })
    expect(state.completed).toBe(true)
    state = walkthroughReducer(state, { type: 'next' })
    expect(isModuleVisible(state, 'population')).toBe(true)
    expect(isModuleVisible(state, 'simulation')).toBe(false)
    expect(state.completed).toBe(false)
    expect(state.task).toBe(0)
  })

  it('requires population, collision diameter, and occlusion in order before revealing simulation controls', () => {
    let state = startPopulation()
    const tasks: WalkthroughTask[] = ['population', 'collision-diameter', 'occlusion']
    expect(WALKTHROUGH_STEPS[1].tasks.map((task) => task.id)).toEqual(tasks)
    for (let index = 0; index < tasks.length; index += 1) {
      expect(state.task).toBe(index)
      const wrongTask = tasks[(index + 1) % tasks.length]
      expect(walkthroughReducer(state, { type: 'interact', task: wrongTask })).toBe(state)
      expect(walkthroughReducer(state, { type: 'next' })).toBe(state)
      state = walkthroughReducer(state, { type: 'interact', task: tasks[index] })
      expect(state.completed).toBe(true)
      expect(isModuleVisible(state, 'simulation')).toBe(false)
      expect(walkthroughReducer(state, { type: 'interact', task: wrongTask })).toBe(state)
      state = walkthroughReducer(state, { type: 'next' })
      expect(state.completed).toBe(false)
    }
    expect(state.step).toBe(2)
    expect(state.task).toBe(0)
    expect(isModuleVisible(state, 'simulation')).toBe(true)
  })

  it('includes both playback speeds, box size, and a starting condition in the simulation module', () => {
    expect(WALKTHROUGH_STEPS[2].tasks.map((task) => task.id)).toEqual(['speed-up', 'slow-down', 'box-size', 'starting-condition'])
  })

  it('requires heating, one thermal face, and cooling in that order', () => {
    expect(WALKTHROUGH_STEPS[3].tasks.map((task) => task.id)).toEqual(['heat', 'one-face', 'cool'])
    const state = { ...initialWalkthrough, mode: 'walkthrough' as const, step: 3 }
    expect(walkthroughReducer(state, { type: 'interact', task: 'cool' })).toBe(state)
    expect(walkthroughReducer(state, { type: 'interact', task: 'one-face' })).toBe(state)
    expect(walkthroughReducer(state, { type: 'interact', task: 'heat' }).completed).toBe(true)
  })

  it('requires a new momentum orbit after adjusting point size', () => {
    let state: typeof initialWalkthrough = { ...initialWalkthrough, mode: 'walkthrough', step: 4 }
    expect(WALKTHROUGH_STEPS[4].tasks.map((task) => task.id)).toEqual(['momentum', 'momentum-orbit'])
    expect(walkthroughReducer(state, { type: 'interact', task: 'momentum-orbit' })).toBe(state)
    state = walkthroughReducer(state, { type: 'interact', task: 'momentum' })
    state = walkthroughReducer(state, { type: 'next' })
    expect(state.step).toBe(4)
    expect(state.task).toBe(1)
    expect(state.completed).toBe(false)
    state = walkthroughReducer(state, { type: 'interact', task: 'momentum-orbit' })
    expect(walkthroughReducer(state, { type: 'next' }).step).toBe(5)
  })

  it('reveals one module after its final task and finishes in full access', () => {
    let state = startPopulation()
    for (let index = 1; index < WALKTHROUGH_STEPS.length; index += 1) {
      expect(state.step).toBe(index)
      expect(WALKTHROUGH_STEPS.filter((step) => isModuleVisible(state, step.id))).toHaveLength(index + 1)
      for (const [taskIndex, task] of WALKTHROUGH_STEPS[index].tasks.entries()) {
        expect(state.task).toBe(taskIndex)
        expect(walkthroughReducer(state, { type: 'interact', task: 'zoom' })).toBe(state)
        expect(walkthroughReducer(state, { type: 'next' })).toBe(state)
        state = walkthroughReducer(state, { type: 'interact', task: task.id })
        state = walkthroughReducer(state, { type: 'next' })
      }
    }
    expect(state.mode).toBe('full')
  })

  it('allows leaving an incomplete walkthrough and ignores later task events', () => {
    const state = walkthroughReducer(walkthroughReducer(initialWalkthrough, { type: 'start' }), { type: 'full' })
    expect(state.mode).toBe('full')
    expect(walkthroughReducer(state, { type: 'zoom', direction: 'in' })).toBe(state)
  })
})
