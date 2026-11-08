import { describe, expect, it } from 'vitest'
import { FrameRateMonitor } from './frameRate'

function windowAt(monitor: FrameRateMonitor, fps: number) {
  let result = null
  for (let frame = 0; frame < fps; frame += 1) result = monitor.sample(1001 / fps)
  return result
}

describe('frame-rate warning', () => {
  it('measures actual frames and requires sustained slowdown', () => {
    const monitor = new FrameRateMonitor()
    expect(windowAt(monitor, 60)).toEqual({ fps: 60, limited: false })
    expect(windowAt(monitor, 30)).toEqual({ fps: 30, limited: false })
    expect(windowAt(monitor, 30)).toEqual({ fps: 30, limited: true })
  })

  it('ignores an isolated stall and clears after recovery without threshold flicker', () => {
    const monitor = new FrameRateMonitor()
    windowAt(monitor, 30)
    windowAt(monitor, 60)
    expect(windowAt(monitor, 30)?.limited).toBe(false)
    expect(windowAt(monitor, 30)?.limited).toBe(true)
    expect(windowAt(monitor, 52)?.limited).toBe(true)
    expect(windowAt(monitor, 60)?.limited).toBe(false)
  })

  it('discards partial samples and warnings when reset after tab visibility changes', () => {
    const monitor = new FrameRateMonitor()
    windowAt(monitor, 30)
    windowAt(monitor, 30)
    monitor.sample(500)
    monitor.reset()
    expect(monitor.sample(500)).toBeNull()
    monitor.reset()
    expect(windowAt(monitor, 30)).toEqual({ fps: 30, limited: false })
  })
})
