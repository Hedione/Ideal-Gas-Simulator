export class FrameRateMonitor {
  private elapsed = 0
  private frames = 0
  private slowWindows = 0
  private limited = false

  reset(): void {
    this.elapsed = 0
    this.frames = 0
    this.slowWindows = 0
    this.limited = false
  }

  sample(milliseconds: number): { fps: number; limited: boolean } | null {
    this.elapsed += milliseconds
    this.frames += 1
    if (this.elapsed < 1000) return null

    const fps = this.frames * 1000 / this.elapsed
    // Two slow windows reject brief stalls; separate recovery avoids flicker near 50 FPS.
    this.slowWindows = fps < 50 ? this.slowWindows + 1 : 0
    if (this.slowWindows >= 2) this.limited = true
    if (fps >= 55) this.limited = false
    this.elapsed = 0
    this.frames = 0
    return { fps: Math.round(fps), limited: this.limited }
  }
}
