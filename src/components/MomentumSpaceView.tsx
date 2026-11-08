import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ATOMIC_MASS_UNIT, BOLTZMANN, GasSimulation, thermalSigma } from '../physics'

interface MomentumSpaceViewProps {
  onOrbit?: () => void
  simulation: GasSimulation
  highlightFast: boolean
  speedThreshold: number
  highlightCold: boolean
  coldSpeedThreshold: number
  highlightBand: boolean
  bandCenter: number
  bandHalfWidth: number
  unfocusedOpacity: number
  trackParticle: boolean
  trackedParticleIndex: number
  pointSize: number
}

const momentumVertexShader = `
  attribute vec3 particleColor;
  attribute float particleHighlight;
  varying vec3 vColor;
  varying float vHighlight;
  uniform float pointScale;
  void main() {
    vColor = particleColor;
    vHighlight = particleHighlight;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float emphasis = mix(0.72, 1.65, vHighlight);
    gl_PointSize = clamp(pointScale * emphasis * (3.2 / -mvPosition.z), 0.75, 12.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const momentumFragmentShader = `
  varying vec3 vColor;
  varying float vHighlight;
  uniform float unfocusedOpacity;
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;
    float glow = smoothstep(0.5, 0.05, radius);
    float alpha = mix(unfocusedOpacity, 0.92, vHighlight) * (0.4 + 0.6 * glow);
    gl_FragColor = vec4(vColor * (0.72 + 0.55 * glow), alpha);
  }
`

function niceMomentumReference(target: number): number {
  const exponent = Math.floor(Math.log10(Math.max(target, 1e-40)))
  const magnitude = 10 ** exponent
  const candidates = [1, 2, 5, 10].map((factor) => factor * magnitude)
  return candidates.reduce((best, candidate) => (
    Math.abs(Math.log(candidate / target)) < Math.abs(Math.log(best / target)) ? candidate : best
  ))
}

function formatMomentumReference(value: number): string {
  return `${value.toExponential(1)} kg·m/s`
}

export function MomentumSpaceView(props: MomentumSpaceViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const momentumReferenceLabelRef = useRef<HTMLSpanElement>(null)
  const momentumReferenceBarRef = useRef<HTMLElement>(null)
  const settingsRef = useRef(props)
  settingsRef.current = props

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setClearColor(0x050b10, 1)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050b10, 0.13)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
    camera.position.set(2.35, 1.7, 2.55)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.minDistance = 1.45
    controls.maxDistance = 7
    controls.update()
    const lastRotation = camera.quaternion.clone()
    let orbitInteraction = false
    let pointerOrbit = false
    const preparePointerOrbit = (event: PointerEvent) => {
      pointerOrbit = event.pointerType === 'touch' || event.button === 0
    }
    const beginOrbit = () => {
      // Wheel zoom may carry old damping; require a new pointer rotation gesture.
      orbitInteraction = pointerOrbit && Boolean(settingsRef.current.onOrbit)
      lastRotation.copy(camera.quaternion)
    }
    const endOrbit = () => { orbitInteraction = false; pointerOrbit = false }
    const reportOrbit = () => {
      if (orbitInteraction && camera.quaternion.angleTo(lastRotation) > 0.01) {
        settingsRef.current.onOrbit?.()
        lastRotation.copy(camera.quaternion)
      }
    }
    controls.addEventListener('start', beginOrbit)
    controls.addEventListener('end', endOrbit)
    controls.addEventListener('change', reportOrbit)
    renderer.domElement.addEventListener('pointerdown', preparePointerOrbit, true)

    let coordinates = new Float32Array(props.simulation.count * 3)
    let colors = new Float32Array(props.simulation.count * 3)
    let highlights = new Float32Array(props.simulation.count)
    let geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3))
    geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('particleHighlight', new THREE.BufferAttribute(highlights, 1))
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointScale: { value: 1.2 * Math.min(window.devicePixelRatio, 1.5) * props.pointSize },
        unfocusedOpacity: { value: props.unfocusedOpacity },
      },
      vertexShader: momentumVertexShader,
      fragmentShader: momentumFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const cloud = new THREE.Points(geometry, material)
    cloud.frustumCulled = false
    scene.add(cloud)

    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
      new THREE.LineBasicMaterial({ color: 0x315863, transparent: true, opacity: 0.55 }),
    )
    scene.add(bounds)

    const axes = new THREE.AxesHelper(1.15)
    ;(axes.material as THREE.Material).transparent = true
    ;(axes.material as THREE.Material).opacity = 0.72
    scene.add(axes)

    const floorGrid = new THREE.GridHelper(2, 10, 0x24515c, 0x132f38)
    floorGrid.position.y = -1
    ;(floorGrid.material as THREE.Material).transparent = true
    ;(floorGrid.material as THREE.Material).opacity = 0.42
    scene.add(floorGrid)

    const resize = () => {
      const { clientWidth, clientHeight } = host
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(1, clientHeight)
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const updateCoordinates = () => {
      const simulation = settingsRef.current.simulation
      if (coordinates.length !== simulation.count * 3) {
        const previousGeometry = geometry
        coordinates = new Float32Array(simulation.count * 3)
        colors = new Float32Array(simulation.count * 3)
        highlights = new Float32Array(simulation.count)
        geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3))
        geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3))
        geometry.setAttribute('particleHighlight', new THREE.BufferAttribute(highlights, 1))
        cloud.geometry = geometry
        previousGeometry.dispose()
      }
      const sigma = Math.max(1e-12, thermalSigma(simulation.targetTemperature, simulation.massAmu))
      const normalization = 5 * sigma
      const densityScale = Math.max(0.45, Math.min(1.8, Math.sqrt(10_000 / simulation.count)))
      material.uniforms.pointScale.value = 1.2 * Math.min(window.devicePixelRatio, 1.5) * densityScale * settingsRef.current.pointSize
      material.uniforms.unfocusedOpacity.value = settingsRef.current.unfocusedOpacity
      const current = settingsRef.current
      const trackedIndex = current.trackParticle
        ? Math.max(0, Math.min(simulation.count - 1, current.trackedParticleIndex))
        : -1
      const focusActive = current.highlightFast || current.highlightCold || current.highlightBand
      for (let particle = 0; particle < simulation.count; particle += 1) {
        const offset = particle * 3
        coordinates[offset] = simulation.velocities[offset] / normalization
        coordinates[offset + 1] = simulation.velocities[offset + 1] / normalization
        coordinates[offset + 2] = simulation.velocities[offset + 2] / normalization

        const speed = simulation.speeds[particle]
        const aboveThreshold = current.highlightFast && speed > current.speedThreshold
        const belowThreshold = current.highlightCold && speed < current.coldSpeedThreshold
        const insideBand = current.highlightBand && Math.abs(speed - current.bandCenter) <= current.bandHalfWidth
        const isTracked = particle === trackedIndex
        highlights[particle] = current.trackParticle
          ? (isTracked ? 1 : 0)
          : focusActive
            ? (aboveThreshold || belowThreshold || insideBand ? 1 : 0)
            : 1
        if (isTracked) {
          colors[offset] = 0.76
          colors[offset + 1] = 0.96
          colors[offset + 2] = 1
        } else if (current.trackParticle) {
          colors[offset] = 0.29
          colors[offset + 1] = 0.32
          colors[offset + 2] = 0.33
        } else if (aboveThreshold) {
          colors[offset] = 1
          colors[offset + 1] = 0.52
          colors[offset + 2] = 0.12
        } else if (belowThreshold) {
          colors[offset] = 0.12
          colors[offset + 1] = 0.68
          colors[offset + 2] = 1
        } else if (insideBand) {
          colors[offset] = 0.35
          colors[offset + 1] = 0.93
          colors[offset + 2] = 0.62
        } else if (focusActive) {
          colors[offset] = 0.31
          colors[offset + 1] = 0.34
          colors[offset + 2] = 0.35
        } else {
          colors[offset] = 0.45
          colors[offset + 1] = 0.86
          colors[offset + 2] = 0.91
        }
      }
      ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      ;(geometry.getAttribute('particleColor') as THREE.BufferAttribute).needsUpdate = true
      ;(geometry.getAttribute('particleHighlight') as THREE.BufferAttribute).needsUpdate = true
    }

    updateCoordinates()
    let animationFrame = 0
    let frame = 0
    const centerInCameraSpace = new THREE.Vector3()
    const animate = () => {
      animationFrame = requestAnimationFrame(animate)
      if (frame % 4 === 0) updateCoordinates()
      frame += 1
      controls.update()
      camera.updateMatrixWorld()
      centerInCameraSpace.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse)
      const depth = Math.max(0.001, -centerInCameraSpace.z)
      const pixelsPerWorldUnit = host.clientHeight / (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)))
      const simulation = settingsRef.current.simulation
      const mass = simulation.massAmu * ATOMIC_MASS_UNIT
      const momentumPerWorldUnit = 5 * Math.sqrt(mass * BOLTZMANN * simulation.targetTemperature)
      const targetMomentum = 72 * momentumPerWorldUnit / Math.max(pixelsPerWorldUnit, 1e-6)
      const referenceMomentum = niceMomentumReference(targetMomentum)
      const referencePixels = referenceMomentum / momentumPerWorldUnit * pixelsPerWorldUnit
      if (momentumReferenceBarRef.current) momentumReferenceBarRef.current.style.width = `${referencePixels.toFixed(2)}px`
      if (momentumReferenceLabelRef.current) momentumReferenceLabelRef.current.textContent = formatMomentumReference(referenceMomentum)
      renderer.render(scene, camera)
    }
    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      controls.removeEventListener('start', beginOrbit)
      controls.removeEventListener('end', endOrbit)
      controls.removeEventListener('change', reportOrbit)
      renderer.domElement.removeEventListener('pointerdown', preparePointerOrbit, true)
      controls.dispose()
      geometry.dispose()
      material.dispose()
      ;(bounds.geometry as THREE.BufferGeometry).dispose()
      ;(bounds.material as THREE.Material).dispose()
      axes.dispose()
      floorGrid.geometry.dispose()
      ;(floorGrid.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [props.simulation])

  return (
    <div className="momentum-space-shell">
      <div
        ref={hostRef}
        className="momentum-space-canvas"
        aria-label="Interactive three-dimensional particle momentum-space distribution. Drag to rotate."
      />
      <div className="momentum-axis-key" aria-hidden="true">
        <span className="axis-x">p<sub>x</sub></span>
        <span className="axis-y">p<sub>y</sub></span>
        <span className="axis-z">p<sub>z</sub></span>
      </div>
      <div className="momentum-reference" aria-label="Live momentum scale reference">
        <span ref={momentumReferenceLabelRef}>—</span>
        <i ref={momentumReferenceBarRef} />
      </div>
    </div>
  )
}
