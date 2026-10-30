import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GasSimulation, thermalSigma } from '../physics'

interface SimulationViewProps {
  simulation: GasSimulation
  playing: boolean
  speedMultiplier: number
  thermostatEnabled: boolean
  thermostatRate: number
  singleFaceBath: boolean
  dsmcEnabled: boolean
  collisionDiameterAngstrom: number
  particleMarkerSize: number
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

const vertexShader = `
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

const fragmentShader = `
  varying vec3 vColor;
  varying float vHighlight;
  uniform float unfocusedOpacity;
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;
    float glow = smoothstep(0.5, 0.05, radius);
    float alpha = mix(unfocusedOpacity, 1.0, vHighlight) * (0.42 + 0.58 * glow);
    gl_FragColor = vec4(vColor * (0.72 + 0.55 * glow), alpha);
  }
`

function writeThermalColor(target: Float32Array, offset: number, normalized: number): void {
  const stops = [
    [0.08, 0.34, 1.0],
    [0.0, 0.86, 1.0],
    [0.3, 0.95, 0.58],
    [1.0, 0.78, 0.16],
    [1.0, 0.2, 0.12],
  ]
  const scaled = Math.min(0.999, Math.max(0, normalized)) * (stops.length - 1)
  const lower = Math.floor(scaled)
  const mix = scaled - lower
  const a = stops[lower]
  const b = stops[Math.min(lower + 1, stops.length - 1)]
  target[offset] = a[0] + (b[0] - a[0]) * mix
  target[offset + 1] = a[1] + (b[1] - a[1]) * mix
  target[offset + 2] = a[2] + (b[2] - a[2]) * mix
}

export function SimulationView(props: SimulationViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const trackPositionRef = useRef<HTMLSpanElement>(null)
  const trackSpeedRef = useRef<HTMLSpanElement>(null)
  const collisionIndicatorRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(props)
  settingsRef.current = props

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x050b10, 1)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050b10, 0.09)
    const camera = new THREE.PerspectiveCamera(43, 1, 0.01, 100)
    camera.position.set(1.72, 1.28, 1.82)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.065
    controls.minDistance = 1.2
    controls.maxDistance = 6

    let geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(props.simulation.positions, 3))
    let colors = new Float32Array(props.simulation.count * 3)
    let highlights = new Float32Array(props.simulation.count)
    geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('particleHighlight', new THREE.BufferAttribute(highlights, 1))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointScale: { value: 2.15 * Math.min(window.devicePixelRatio, 1.75) },
        unfocusedOpacity: { value: props.unfocusedOpacity },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    // Center the point cloud without mutating the shared normalized physics buffer.
    points.position.set(-0.5, -0.5, -0.5)
    scene.add(points)

    const trackedMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xc8f7ff, depthTest: false, transparent: true, opacity: 0.95 }),
    )
    trackedMarker.renderOrder = 10
    trackedMarker.visible = false
    scene.add(trackedMarker)

    const maximumTrailSegments = 120
    const trailPositions = new Float32Array(maximumTrailSegments * 6)
    const trailGeometry = new THREE.BufferGeometry()
    const trailAttribute = new THREE.BufferAttribute(trailPositions, 3)
    trailAttribute.setUsage(THREE.DynamicDrawUsage)
    trailGeometry.setAttribute('position', trailAttribute)
    trailGeometry.setDrawRange(0, 0)
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x72dbe8,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
    })
    const trackedTrail = new THREE.LineSegments(trailGeometry, trailMaterial)
    trackedTrail.renderOrder = 9
    trackedTrail.visible = false
    scene.add(trackedTrail)

    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x53d6e7, transparent: true, opacity: 0.5 }),
    )
    scene.add(box)

    const innerBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x0c3d49, transparent: true, opacity: 0.055, side: THREE.BackSide }),
    )
    scene.add(innerBox)

    const thermalFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.985, 0.985),
      new THREE.MeshBasicMaterial({
        color: 0xffb547,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    thermalFace.position.x = 0.501
    thermalFace.rotation.y = Math.PI / 2
    thermalFace.visible = false
    scene.add(thermalFace)

    const grid = new THREE.GridHelper(1.5, 10, 0x174957, 0x102a34)
    grid.position.y = -0.505
    scene.add(grid)

    const resize = () => {
      const { clientWidth, clientHeight } = host
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(1, clientHeight)
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    let animationFrame = 0
    let previous = performance.now()
    let frame = 0
    let activeTrackedParticle = -1
    let trailSegmentCount = 0
    let previousTrackedPosition: THREE.Vector3 | null = null
    let lastWallCollisions = 0
    let lastThermalContacts = 0
    let lastParticleCollisions = 0
    let collisionIndicatorUntil = 0
    const trackedPosition = new THREE.Vector3()
    const origin = new THREE.Vector3()
    const animate = (now: number) => {
      animationFrame = requestAnimationFrame(animate)
      const current = settingsRef.current
      const wallDt = Math.min(0.05, Math.max(0, (now - previous) / 1000))
      previous = now
      const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute
      if (positionAttribute.array !== current.simulation.positions) {
        const previousGeometry = geometry
        geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(current.simulation.positions, 3))
        colors = new Float32Array(current.simulation.count * 3)
        highlights = new Float32Array(current.simulation.count)
        geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3))
        geometry.setAttribute('particleHighlight', new THREE.BufferAttribute(highlights, 1))
        points.geometry = geometry
        previousGeometry.dispose()
      }
      if (current.playing) {
        const physicalDt = wallDt * 2e-8 * current.speedMultiplier
        current.simulation.advance(
          physicalDt,
          current.thermostatEnabled ? current.thermostatRate : 0,
          current.singleFaceBath,
          current.dsmcEnabled,
          current.collisionDiameterAngstrom * 1e-10,
        )
        ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      }

      // User-controlled marker size is independent of collision physics, while
      // population compensation keeps dense ensembles from filling the view.
      const populationScale = Math.max(0.32, Math.min(2.2, Math.sqrt(10_000 / current.simulation.count)))
      material.uniforms.pointScale.value = 0.72 * Math.min(window.devicePixelRatio, 1.75) * current.particleMarkerSize * populationScale
      material.uniforms.unfocusedOpacity.value = current.unfocusedOpacity
      trackedMarker.scale.setScalar(Math.max(0.5, current.particleMarkerSize))
      thermalFace.visible = current.thermostatEnabled && current.singleFaceBath

      if (current.trackParticle && current.simulation.count > 0) {
        const trackedIndex = Math.max(0, Math.min(current.simulation.count - 1, current.trackedParticleIndex))
        const positionIndex = trackedIndex * 3
        trackedPosition.set(
          current.simulation.positions[positionIndex] - 0.5,
          current.simulation.positions[positionIndex + 1] - 0.5,
          current.simulation.positions[positionIndex + 2] - 0.5,
        )
        trackedMarker.visible = true
        trackedTrail.visible = true
        trackedMarker.position.copy(trackedPosition)
        controls.target.lerp(origin, 0.08)

        if (activeTrackedParticle !== trackedIndex) {
          activeTrackedParticle = trackedIndex
          trailSegmentCount = 0
          trailGeometry.setDrawRange(0, 0)
          previousTrackedPosition = trackedPosition.clone()
          lastWallCollisions = current.simulation.wallCollisionCounts[trackedIndex]
          lastThermalContacts = current.simulation.thermalAccommodationCounts[trackedIndex]
          lastParticleCollisions = current.simulation.particleCollisionCounts[trackedIndex]
          collisionIndicatorUntil = 0
        } else if (frame % 2 === 0 && previousTrackedPosition) {
          const distance = previousTrackedPosition.distanceTo(trackedPosition)
          if (distance < 0.35 && distance > 1e-6) {
            let offset = trailSegmentCount * 6
            if (trailSegmentCount >= maximumTrailSegments) {
              trailPositions.copyWithin(0, 6)
              offset = (maximumTrailSegments - 1) * 6
            } else {
              trailSegmentCount += 1
            }
            trailPositions[offset] = previousTrackedPosition.x
            trailPositions[offset + 1] = previousTrackedPosition.y
            trailPositions[offset + 2] = previousTrackedPosition.z
            trailPositions[offset + 3] = trackedPosition.x
            trailPositions[offset + 4] = trackedPosition.y
            trailPositions[offset + 5] = trackedPosition.z
            trailAttribute.needsUpdate = true
            trailGeometry.setDrawRange(0, trailSegmentCount * 2)
          }
          previousTrackedPosition.copy(trackedPosition)
        }

        if (trackPositionRef.current) {
          trackPositionRef.current.textContent = `${current.simulation.positions[positionIndex].toFixed(3)}, ${current.simulation.positions[positionIndex + 1].toFixed(3)}, ${current.simulation.positions[positionIndex + 2].toFixed(3)} μm`
        }
        if (trackSpeedRef.current) {
          trackSpeedRef.current.textContent = `${current.simulation.speeds[trackedIndex].toFixed(1)} m/s`
        }

        const wallCount = current.simulation.wallCollisionCounts[trackedIndex]
        const thermalCount = current.simulation.thermalAccommodationCounts[trackedIndex]
        const particleCount = current.simulation.particleCollisionCounts[trackedIndex]
        const indicator = collisionIndicatorRef.current
        if (indicator && particleCount !== lastParticleCollisions) {
          indicator.textContent = '● PARTICLE COLLISION'
          indicator.className = 'collision-indicator active particle'
          collisionIndicatorUntil = now + 700
        } else if (indicator && thermalCount !== lastThermalContacts) {
          indicator.textContent = '● THERMAL WALL CONTACT'
          indicator.className = 'collision-indicator active thermal'
          collisionIndicatorUntil = now + 700
        } else if (indicator && wallCount !== lastWallCollisions) {
          indicator.textContent = '● ELASTIC WALL CONTACT'
          indicator.className = 'collision-indicator active wall'
          collisionIndicatorUntil = now + 500
        } else if (indicator && now > collisionIndicatorUntil) {
          indicator.textContent = '○ NO RECENT COLLISION'
          indicator.className = 'collision-indicator'
        }
        lastWallCollisions = wallCount
        lastThermalContacts = thermalCount
        lastParticleCollisions = particleCount
      } else {
        trackedMarker.visible = false
        trackedTrail.visible = false
        activeTrackedParticle = -1
        previousTrackedPosition = null
        controls.target.lerp(origin, 0.08)
      }
      if (frame % 2 === 0 || !current.playing) {
        const sigma = thermalSigma(current.simulation.targetTemperature, current.simulation.massAmu)
        const trackedColorIndex = current.trackParticle
          ? Math.max(0, Math.min(current.simulation.count - 1, current.trackedParticleIndex))
          : -1
        for (let i = 0; i < current.simulation.count; i += 1) {
          const offset = i * 3
          const speed = current.simulation.speeds[i]
          const aboveThreshold = current.highlightFast && speed > current.speedThreshold
          const belowThreshold = current.highlightCold && speed < current.coldSpeedThreshold
          const insideBand = current.highlightBand && Math.abs(speed - current.bandCenter) <= current.bandHalfWidth
          const focusActive = current.highlightFast || current.highlightCold || current.highlightBand
          const isTracked = i === trackedColorIndex
          highlights[i] = current.trackParticle ? (isTracked ? 1 : 0) : focusActive ? (aboveThreshold || belowThreshold || insideBand ? 1 : 0) : 1
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
            writeThermalColor(colors, offset, current.simulation.speeds[i] / (3.2 * sigma))
          }
        }
        ;(geometry.getAttribute('particleColor') as THREE.BufferAttribute).needsUpdate = true
        ;(geometry.getAttribute('particleHighlight') as THREE.BufferAttribute).needsUpdate = true
      }
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
      ;(box.geometry as THREE.BufferGeometry).dispose()
      ;(box.material as THREE.Material).dispose()
      ;(innerBox.geometry as THREE.BufferGeometry).dispose()
      ;(innerBox.material as THREE.Material).dispose()
      ;(thermalFace.geometry as THREE.BufferGeometry).dispose()
      ;(thermalFace.material as THREE.Material).dispose()
      ;(trackedMarker.geometry as THREE.BufferGeometry).dispose()
      ;(trackedMarker.material as THREE.Material).dispose()
      trailGeometry.dispose()
      trailMaterial.dispose()
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [props.simulation])

  return (
    <div className="simulation-shell">
      <div className="panel-heading overlay-heading">
        <div>
          <span className="eyebrow">LIVE PARTICLE FIELD</span>
          <h2>Microscopic view</h2>
        </div>
        <span className={`status-pill ${props.playing ? 'active' : ''}`}>
          <i /> {props.playing ? 'RUNNING' : 'PAUSED'}
        </span>
      </div>
      <div ref={hostRef} className="simulation-canvas" aria-label="Interactive 3D gas particle simulation" />
      <div className="view-hint">DRAG TO ORBIT · SCROLL TO ZOOM · RIGHT-DRAG TO PAN</div>
      <div className="scale-note">1 μm box · particles enlarged for visibility</div>
      {props.thermostatEnabled && props.singleFaceBath && (
        <div className="face-contact-badge"><i /> +X THERMAL CONTACT</div>
      )}
      {props.trackParticle && (
        <div className="track-panel">
          <div className="track-panel-title"><i /> TRACKING PARTICLE #{props.trackedParticleIndex + 1}</div>
          <div className="track-data"><span>POSITION</span><b ref={trackPositionRef}>—</b></div>
          <div className="track-data"><span>SPEED</span><b ref={trackSpeedRef}>—</b></div>
          <div ref={collisionIndicatorRef} className="collision-indicator">○ NO RECENT COLLISION</div>
        </div>
      )}
      <div
        className={`color-key ${props.trackParticle ? 'tracking-key' : props.highlightBand ? 'band-threshold-key' : props.highlightFast && props.highlightCold ? 'dual-threshold-key' : props.highlightFast ? 'threshold-key' : props.highlightCold ? 'cold-threshold-key' : ''}`}
        aria-label={props.trackParticle ? 'Tracked particle color legend' : props.highlightBand ? 'Speed band color legend' : 'Particle speed color legend'}
      >
        <span>{props.trackParticle ? 'others' : props.highlightBand ? `${Math.max(0, props.bandCenter - props.bandHalfWidth)}` : props.highlightCold ? `< ${props.coldSpeedThreshold} m/s` : props.highlightFast ? `≤ ${props.speedThreshold} m/s` : 'slow'}</span>
        <i />
        <span>{props.trackParticle ? 'tracked' : props.highlightBand ? `${props.bandCenter + props.bandHalfWidth} m/s` : props.highlightFast ? `> ${props.speedThreshold} m/s` : props.highlightCold ? 'warmer' : 'fast'}</span>
      </div>
    </div>
  )
}
