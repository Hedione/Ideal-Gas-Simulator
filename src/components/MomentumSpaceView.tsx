import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ATOMIC_MASS_UNIT, BOLTZMANN, GasSimulation, thermalSigma } from '../physics'

interface MomentumSpaceViewProps {
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
    gl_PointSize = clamp(pointScale * emphasis * (3.2 / -mvPosition.z), 0.75, 5.0);
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

export function MomentumSpaceView(props: MomentumSpaceViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
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

    let coordinates = new Float32Array(props.simulation.count * 3)
    let colors = new Float32Array(props.simulation.count * 3)
    let highlights = new Float32Array(props.simulation.count)
    let geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3))
    geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('particleHighlight', new THREE.BufferAttribute(highlights, 1))
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointScale: { value: 1.8 * Math.min(window.devicePixelRatio, 1.5) },
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
      material.uniforms.pointScale.value = 1.2 * Math.min(window.devicePixelRatio, 1.5) * densityScale
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
    const animate = () => {
      animationFrame = requestAnimationFrame(animate)
      if (frame % 4 === 0) updateCoordinates()
      frame += 1
      controls.update()
      renderer.render(scene, camera)
    }
    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
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

  const mass = props.simulation.massAmu * ATOMIC_MASS_UNIT
  const momentumLimit = 5 * Math.sqrt(mass * BOLTZMANN * props.simulation.targetTemperature)

  return (
    <div className="momentum-space-shell">
      <div ref={hostRef} className="momentum-space-canvas" aria-label="Interactive three-dimensional particle momentum-space distribution" />
      <div className="momentum-axis-key" aria-hidden="true">
        <span className="axis-x">p<sub>x</sub></span>
        <span className="axis-y">p<sub>y</sub></span>
        <span className="axis-z">p<sub>z</sub></span>
      </div>
      <div className="momentum-scale">CUBE BOUNDARY ±{momentumLimit.toExponential(2)} kg·m/s PER AXIS</div>
      <div className="momentum-performance">ALL {props.simulation.count.toLocaleString()} PARTICLES · 15 Hz DATA REFRESH</div>
    </div>
  )
}
