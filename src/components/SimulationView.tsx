import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GasSimulation, thermalSigma, ThermalWallContact } from '../physics'

interface SimulationViewProps {
  simulation: GasSimulation
  playing: boolean
  speedMultiplier: number
  thermostatEnabled: boolean
  diffuseReflectionProbability: number
  thermalBathMode: 'all' | 'one' | 'two'
  thermalWalls: readonly ThermalWallContact[]
  dsmcEnabled: boolean
  collisionDiameterAngstrom: number
  particleMarkerDiameterAngstrom: number
  particleOcclusionEnabled: boolean
  knudsenNumber: number
  brownianEnabled: boolean
  brownianDiameterAngstrom: number
  brownianMassAmu: number
  brownianFocus: boolean
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
  varying float vPointCoverage;
  uniform float pointScale;
  void main() {
    vColor = particleColor;
    vHighlight = particleHighlight;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float requestedPointSize = pointScale * (3.2 / -mvPosition.z);
    gl_PointSize = max(requestedPointSize, 1.0);
    vPointCoverage = min(1.0, requestedPointSize * requestedPointSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vHighlight;
  varying float vPointCoverage;
  uniform float unfocusedOpacity;
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;
    float edgeAlpha = 1.0 - smoothstep(0.42, 0.5, radius);
    float glow = smoothstep(0.5, 0.05, radius);
    float alpha = vPointCoverage * mix(unfocusedOpacity, 1.0, vHighlight) * (0.42 + 0.58 * glow) * edgeAlpha;
    gl_FragColor = vec4(vColor * (0.72 + 0.55 * glow), alpha);
  }
`

const depthFragmentShader = `
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    if (length(centered) > 0.5) discard;
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

function niceReferenceLength(targetMeters: number): number {
  const exponent = Math.floor(Math.log10(Math.max(targetMeters, 1e-15)))
  const magnitude = 10 ** exponent
  const candidates = [1, 2, 5, 10].map((factor) => factor * magnitude)
  return candidates.reduce((best, candidate) => (
    Math.abs(Math.log(candidate / targetMeters)) < Math.abs(Math.log(best / targetMeters)) ? candidate : best
  ))
}

function formatReferenceLength(meters: number): string {
  if (meters >= 1e-6) return `${Number((meters * 1e6).toPrecision(3))} µm`
  if (meters >= 1e-9) return `${Number((meters * 1e9).toPrecision(3))} nm`
  return `${Number((meters * 1e10).toPrecision(3))} Å`
}

function placeThermalFace(target: THREE.Mesh, wall: ThermalWallContact): void {
  target.position.set(0, 0, 0)
  target.rotation.set(0, 0, 0)
  const coordinate = wall.positive ? 0.501 : -0.501
  if (wall.axis === 0) {
    target.position.x = coordinate
    target.rotation.y = Math.PI / 2
  } else if (wall.axis === 1) {
    target.position.y = coordinate
    target.rotation.x = Math.PI / 2
  } else {
    target.position.z = coordinate
  }
}

function thermalFaceLabel(wall: ThermalWallContact): string {
  return `${wall.positive ? '+' : '−'}${['X', 'Y', 'Z'][wall.axis]}`
}

type FlowRegime = {
  key: 'continuum' | 'slip' | 'transitional' | 'free-molecular'
  label: string
  criterion: string
}

function getFlowRegime(knudsenNumber: number): FlowRegime {
  if (knudsenNumber < 0.01) {
    return { key: 'continuum', label: 'CONTINUUM FLOW', criterion: 'Kn < 0.01' }
  }
  if (knudsenNumber < 0.1) {
    return { key: 'slip', label: 'SLIP FLOW', criterion: '0.01 ≤ Kn < 0.1' }
  }
  if (knudsenNumber < 10) {
    return { key: 'transitional', label: 'TRANSITIONAL FLOW', criterion: '0.1 ≤ Kn < 10' }
  }
  return { key: 'free-molecular', label: 'FREE MOLECULAR FLOW', criterion: 'Kn ≥ 10' }
}

function formatKnudsenNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  if (value < 0.001 || value >= 100) return value.toExponential(2)
  return value.toFixed(3)
}

function getPackingRegime(packingFraction: number): { key: string; label: string; detail: string } {
  if (packingFraction < 0.01) {
    return { key: 'credible', label: 'DILUTE-GAS REGIME', detail: 'φ < 1% · dilute DSMC conditions' }
  }
  if (packingFraction < 0.05) {
    return { key: 'caution', label: 'DENSE-GAS CAUTION', detail: '1% ≤ φ < 5% · correlations may matter' }
  }
  if (packingFraction < 0.3) {
    return { key: 'warning', label: 'OUTSIDE DILUTE LIMIT', detail: '5% ≤ φ < 30% · numerical stress test' }
  }
  return { key: 'severe', label: 'PHYSICALLY DUBIOUS PACKING', detail: 'φ ≥ 30% · ideal-gas model invalid' }
}

function formatPackingFraction(value: number): string {
  const percent = value * 100
  if (percent < 0.001) return `${percent.toExponential(2)}%`
  if (percent < 10) return `${percent.toFixed(3)}%`
  return `${percent.toFixed(1)}%`
}

export function SimulationView(props: SimulationViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const trackPositionRef = useRef<HTMLSpanElement>(null)
  const trackSpeedRef = useRef<HTMLSpanElement>(null)
  const collisionIndicatorRef = useRef<HTMLDivElement>(null)
  const lengthReferenceLabelRef = useRef<HTMLSpanElement>(null)
  const lengthReferenceBarRef = useRef<HTMLElement>(null)
  const orientationLinesRef = useRef<Array<SVGLineElement | null>>([])
  const orientationLabelsRef = useRef<Array<SVGTextElement | null>>([])
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
    const camera = new THREE.PerspectiveCamera(43, 1, 0.0001, 100)
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
      depthFunc: props.particleOcclusionEnabled ? THREE.EqualDepth : THREE.LessEqualDepth,
      blending: props.particleOcclusionEnabled ? THREE.NormalBlending : THREE.AdditiveBlending,
    })
    const depthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        pointScale: { value: 2.15 * Math.min(window.devicePixelRatio, 1.75) },
      },
      vertexShader,
      fragmentShader: depthFragmentShader,
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
    })
    let particleOcclusionActive = props.particleOcclusionEnabled
    const depthPoints = new THREE.Points(geometry, depthMaterial)
    const points = new THREE.Points(geometry, material)
    // Center the point cloud without mutating the shared normalized physics buffer.
    depthPoints.position.set(-0.5, -0.5, -0.5)
    points.position.set(-0.5, -0.5, -0.5)
    depthPoints.visible = props.particleOcclusionEnabled
    scene.add(depthPoints, points)

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

    const brownianGeometry = new THREE.SphereGeometry(0.5, 28, 20)
    const brownianMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc76b,
      transparent: true,
      opacity: 0.92,
      depthWrite: true,
    })
    const brownianTracer = new THREE.Mesh(brownianGeometry, brownianMaterial)
    const brownianOutline = new THREE.Mesh(
      brownianGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffe0a3, wireframe: true, transparent: true, opacity: 0.28 }),
    )
    brownianOutline.scale.setScalar(1.025)
    const brownianGroup = new THREE.Group()
    brownianGroup.add(brownianTracer, brownianOutline)
    brownianGroup.visible = false
    scene.add(brownianGroup)

    const brownianTrailPositions = new Float32Array(maximumTrailSegments * 6)
    const brownianTrailGeometry = new THREE.BufferGeometry()
    const brownianTrailAttribute = new THREE.BufferAttribute(brownianTrailPositions, 3)
    brownianTrailAttribute.setUsage(THREE.DynamicDrawUsage)
    brownianTrailGeometry.setAttribute('position', brownianTrailAttribute)
    brownianTrailGeometry.setDrawRange(0, 0)
    const brownianTrailMaterial = new THREE.LineBasicMaterial({ color: 0xffc76b, transparent: true, opacity: 0.62, depthTest: false })
    const brownianTrail = new THREE.LineSegments(brownianTrailGeometry, brownianTrailMaterial)
    brownianTrail.renderOrder = 8
    brownianTrail.visible = false
    scene.add(brownianTrail)

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

    const makeThermalFace = (color: number) => new THREE.Mesh(
      new THREE.PlaneGeometry(0.985, 0.985),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    const primaryThermalFace = makeThermalFace(0xffb547)
    const secondaryThermalFace = makeThermalFace(0xd878ff)
    primaryThermalFace.visible = false
    secondaryThermalFace.visible = false
    scene.add(primaryThermalFace, secondaryThermalFace)

    const baseGridDivisions = 10
    const gridOpacity = 0.82
    const makeReferenceGrid = (level: number, y: number) => {
      // Only dyadic levels are created. Moving up one level doubles the line
      // count on each axis, so every existing square is divided into four.
      const divisions = baseGridDivisions * 2 ** level
      const nextGrid = new THREE.GridHelper(1.5, divisions, 0x102a34, 0x102a34)
      nextGrid.position.y = y
      const nextMaterial = nextGrid.material as THREE.Material
      nextMaterial.transparent = true
      nextMaterial.depthWrite = false
      return nextGrid
    }
    const setReferenceGridOpacity = (target: THREE.GridHelper, opacity: number) => {
      const targetMaterial = target.material as THREE.Material
      targetMaterial.opacity = gridOpacity * opacity
      target.visible = opacity > 0.001
    }
    const disposeReferenceGrid = (target: THREE.GridHelper) => {
      scene.remove(target)
      target.geometry.dispose()
      ;(target.material as THREE.Material).dispose()
    }

    const initialGridScale = Math.max(1, Math.min(100, 1e-6 / props.simulation.boxLengthMeters))
    let referenceGridLevel = Math.floor(Math.log2(initialGridScale))
    let coarseGrid = makeReferenceGrid(referenceGridLevel, -0.506)
    let fineGrid = makeReferenceGrid(referenceGridLevel + 1, -0.505)
    scene.add(coarseGrid, fineGrid)

    const updateReferenceGrid = (visualScale: number) => {
      const continuousLevel = Math.max(0, Math.log2(visualScale))
      const nextLevel = Math.floor(continuousLevel)
      if (nextLevel !== referenceGridLevel) {
        disposeReferenceGrid(coarseGrid)
        disposeReferenceGrid(fineGrid)
        referenceGridLevel = nextLevel
        coarseGrid = makeReferenceGrid(referenceGridLevel, -0.506)
        fineGrid = makeReferenceGrid(referenceGridLevel + 1, -0.505)
        scene.add(coarseGrid, fineGrid)
      }

      coarseGrid.scale.set(visualScale, 1, visualScale)
      fineGrid.scale.set(visualScale, 1, visualScale)
      const levelProgress = continuousLevel - referenceGridLevel
      const fade = levelProgress * levelProgress * (3 - 2 * levelProgress)
      setReferenceGridOpacity(coarseGrid, 1 - fade)
      setReferenceGridOpacity(fineGrid, fade)
    }
    updateReferenceGrid(initialGridScale)

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
    let brownianTrailSegmentCount = 0
    let brownianWasEnabled = false
    let previousBrownianPosition: THREE.Vector3 | null = null
    const trackedPosition = new THREE.Vector3()
    const brownianPosition = new THREE.Vector3()
    const viewTarget = new THREE.Vector3()
    const drawingBufferSize = new THREE.Vector2()
    const boxCenterInCameraSpace = new THREE.Vector3()
    const cameraQuaternion = new THREE.Quaternion()
    const inverseCameraQuaternion = new THREE.Quaternion()
    const orientationVector = new THREE.Vector3()
    const orientationAxes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ]
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
        depthPoints.geometry = geometry
        points.geometry = geometry
        previousGeometry.dispose()
      }
      const requestedBrownianDiameter = current.brownianDiameterAngstrom * 1e-10
      const brownianConfigurationChanged =
        current.simulation.brownianEnabled !== current.brownianEnabled ||
        Math.abs(current.simulation.brownianDiameterMeters - requestedBrownianDiameter) > 1e-18
      current.simulation.setBrownianObject(
        current.brownianEnabled,
        requestedBrownianDiameter,
        current.brownianMassAmu,
      )
      if (brownianConfigurationChanged) {
        ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      }
      if (current.playing) {
        const physicalDt = wallDt * 1e-10 * current.speedMultiplier
        current.simulation.advance(
          physicalDt,
          current.thermostatEnabled ? current.diffuseReflectionProbability : 0,
          current.thermalBathMode === 'all' ? false : current.thermalWalls,
          current.dsmcEnabled,
          current.collisionDiameterAngstrom * 1e-10,
        )
        ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      }

      // Physics positions remain normalized to a unit box. Marker diameter is
      // converted directly from metres to that same coordinate system, so its
      // rendered size depends only on marker diameter and physical box length.
      const boxVisualScale = Math.max(1, Math.min(100, 1e-6 / current.simulation.boxLengthMeters))
      updateReferenceGrid(boxVisualScale)
      const markerWorldDiameter = current.particleMarkerDiameterAngstrom * 1e-10 / current.simulation.boxLengthMeters
      renderer.getDrawingBufferSize(drawingBufferSize)
      material.uniforms.pointScale.value = markerWorldDiameter * drawingBufferSize.y / (6.4 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)))
      depthMaterial.uniforms.pointScale.value = material.uniforms.pointScale.value
      material.uniforms.unfocusedOpacity.value = current.unfocusedOpacity
      if (current.particleOcclusionEnabled !== particleOcclusionActive) {
        particleOcclusionActive = current.particleOcclusionEnabled
        depthPoints.visible = particleOcclusionActive
        material.blending = particleOcclusionActive ? THREE.NormalBlending : THREE.AdditiveBlending
        material.depthFunc = particleOcclusionActive ? THREE.EqualDepth : THREE.LessEqualDepth
        material.needsUpdate = true
      }
      const showSelectedThermalFaces = current.thermostatEnabled && current.thermalBathMode !== 'all'
      const primaryWall = current.thermalWalls[0]
      const secondaryWall = current.thermalWalls[1]
      primaryThermalFace.visible = showSelectedThermalFaces && Boolean(primaryWall)
      secondaryThermalFace.visible = showSelectedThermalFaces && current.thermalBathMode === 'two' && Boolean(secondaryWall)
      if (primaryWall) placeThermalFace(primaryThermalFace, primaryWall)
      if (secondaryWall) placeThermalFace(secondaryThermalFace, secondaryWall)

      brownianGroup.visible = current.brownianEnabled
      brownianTrail.visible = current.brownianEnabled
      if (current.brownianEnabled) {
        const diameter = current.brownianDiameterAngstrom * 1e-10 / current.simulation.boxLengthMeters
        brownianGroup.scale.setScalar(diameter)
        brownianPosition.set(
          current.simulation.brownianPosition[0] - 0.5,
          current.simulation.brownianPosition[1] - 0.5,
          current.simulation.brownianPosition[2] - 0.5,
        )
        brownianGroup.position.copy(brownianPosition)
        if (!brownianWasEnabled) {
          brownianTrailSegmentCount = 0
          brownianTrailGeometry.setDrawRange(0, 0)
          previousBrownianPosition = brownianPosition.clone()
        } else if (frame % 2 === 0 && previousBrownianPosition) {
          const distance = previousBrownianPosition.distanceTo(brownianPosition)
          if (distance > 1e-7 && distance < 0.4) {
            let offset = brownianTrailSegmentCount * 6
            if (brownianTrailSegmentCount >= maximumTrailSegments) {
              brownianTrailPositions.copyWithin(0, 6)
              offset = (maximumTrailSegments - 1) * 6
            } else {
              brownianTrailSegmentCount += 1
            }
            brownianTrailPositions[offset] = previousBrownianPosition.x
            brownianTrailPositions[offset + 1] = previousBrownianPosition.y
            brownianTrailPositions[offset + 2] = previousBrownianPosition.z
            brownianTrailPositions[offset + 3] = brownianPosition.x
            brownianTrailPositions[offset + 4] = brownianPosition.y
            brownianTrailPositions[offset + 5] = brownianPosition.z
            brownianTrailAttribute.needsUpdate = true
            brownianTrailGeometry.setDrawRange(0, brownianTrailSegmentCount * 2)
          }
          previousBrownianPosition.copy(brownianPosition)
        }
      } else {
        previousBrownianPosition = null
      }
      brownianWasEnabled = current.brownianEnabled

      if (current.trackParticle && current.simulation.count > 0) {
        const trackedIndex = Math.max(0, Math.min(current.simulation.count - 1, current.trackedParticleIndex))
        const positionIndex = trackedIndex * 3
        trackedPosition.set(
          current.simulation.positions[positionIndex] - 0.5,
          current.simulation.positions[positionIndex + 1] - 0.5,
          current.simulation.positions[positionIndex + 2] - 0.5,
        )
        trackedTrail.visible = true
        controls.target.lerp(viewTarget, 0.08)

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
          const boxLengthMicrometers = current.simulation.boxLengthMeters * 1e6
          trackPositionRef.current.textContent = `${(current.simulation.positions[positionIndex] * boxLengthMicrometers).toFixed(3)}, ${(current.simulation.positions[positionIndex + 1] * boxLengthMicrometers).toFixed(3)}, ${(current.simulation.positions[positionIndex + 2] * boxLengthMicrometers).toFixed(3)} μm`
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
        trackedTrail.visible = false
        activeTrackedParticle = -1
        previousTrackedPosition = null
        controls.target.lerp(viewTarget, 0.08)
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
          const brownianFocusActive = current.brownianEnabled && current.brownianFocus
          highlights[i] = brownianFocusActive ? 0 : current.trackParticle ? (isTracked ? 1 : 0) : focusActive ? (aboveThreshold || belowThreshold || insideBand ? 1 : 0) : 1
          if (brownianFocusActive) {
            colors[offset] = 0.25
            colors[offset + 1] = 0.28
            colors[offset + 2] = 0.29
          } else if (isTracked) {
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
      camera.updateMatrixWorld()
      boxCenterInCameraSpace.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse)
      const boxDepth = Math.max(0.001, -boxCenterInCameraSpace.z)
      const cssPixelsPerWorldUnit = host.clientHeight / (2 * boxDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)))
      const targetReferenceMeters = 90 * current.simulation.boxLengthMeters / Math.max(cssPixelsPerWorldUnit, 1e-6)
      const referenceMeters = niceReferenceLength(targetReferenceMeters)
      const referencePixels = referenceMeters / current.simulation.boxLengthMeters * cssPixelsPerWorldUnit
      if (lengthReferenceBarRef.current) lengthReferenceBarRef.current.style.width = `${referencePixels.toFixed(2)}px`
      if (lengthReferenceLabelRef.current) lengthReferenceLabelRef.current.textContent = formatReferenceLength(referenceMeters)
      camera.getWorldQuaternion(cameraQuaternion)
      inverseCameraQuaternion.copy(cameraQuaternion).invert()
      for (let axis = 0; axis < 3; axis += 1) {
        orientationVector.copy(orientationAxes[axis]).applyQuaternion(inverseCameraQuaternion)
        const x = 32 + orientationVector.x * 22
        const y = 32 - orientationVector.y * 22
        const line = orientationLinesRef.current[axis]
        const label = orientationLabelsRef.current[axis]
        if (line) {
          line.setAttribute('x2', x.toFixed(2))
          line.setAttribute('y2', y.toFixed(2))
          line.style.opacity = String(0.45 + 0.55 * (orientationVector.z + 1) * 0.5)
        }
        if (label) {
          label.setAttribute('x', (32 + orientationVector.x * 27).toFixed(2))
          label.setAttribute('y', (35 - orientationVector.y * 27).toFixed(2))
          label.style.opacity = String(0.55 + 0.45 * (orientationVector.z + 1) * 0.5)
        }
      }
      renderer.render(scene, camera)
    }
    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      controls.dispose()
      geometry.dispose()
      material.dispose()
      depthMaterial.dispose()
      ;(box.geometry as THREE.BufferGeometry).dispose()
      ;(box.material as THREE.Material).dispose()
      ;(innerBox.geometry as THREE.BufferGeometry).dispose()
      ;(innerBox.material as THREE.Material).dispose()
      ;(primaryThermalFace.geometry as THREE.BufferGeometry).dispose()
      ;(primaryThermalFace.material as THREE.Material).dispose()
      ;(secondaryThermalFace.geometry as THREE.BufferGeometry).dispose()
      ;(secondaryThermalFace.material as THREE.Material).dispose()
      trailGeometry.dispose()
      trailMaterial.dispose()
      brownianGeometry.dispose()
      brownianMaterial.dispose()
      ;(brownianOutline.material as THREE.Material).dispose()
      brownianTrailGeometry.dispose()
      brownianTrailMaterial.dispose()
      disposeReferenceGrid(coarseGrid)
      disposeReferenceGrid(fineGrid)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [props.simulation])

  const flowRegime = getFlowRegime(props.knudsenNumber)
  const numberDensity = props.simulation.count / (props.simulation.boxLengthMeters ** 3)
  const packingFraction = numberDensity * (Math.PI / 6) * (props.collisionDiameterAngstrom * 1e-10) ** 3
  const packingStatus = getPackingRegime(packingFraction)

  return (
    <div className="simulation-shell">
      <div className="panel-heading overlay-heading">
        <div>
          <span className="eyebrow">LIVE PARTICLE FIELD</span>
          <h2>Microscopic view</h2>
        </div>
        <div className="gas-diagnostic-stack">
          <div className={`flow-regime-indicator ${flowRegime.key}`} title={`Current Knudsen number: ${props.knudsenNumber}`}>
            <b>{flowRegime.label}</b>
            <small>{flowRegime.criterion} · Kn = {formatKnudsenNumber(props.knudsenNumber)}</small>
          </div>
          <div className={`packing-status ${packingStatus.key}`} role={packingStatus.key === 'credible' ? 'status' : 'alert'}>
            <div><b>{packingStatus.label}</b><span>φ = {formatPackingFraction(packingFraction)}</span></div>
            <small>{packingStatus.detail}</small>
          </div>
        </div>
      </div>
      <div ref={hostRef} className="simulation-canvas" aria-label="Interactive 3D gas particle simulation" />
      <div className="view-hint">DRAG TO ORBIT · SCROLL TO ZOOM · RIGHT-DRAG TO PAN</div>
      <div className="scale-note">{(props.simulation.boxLengthMeters * 1e6).toFixed(2)} μm box · marker diameter to scale</div>
      {props.thermostatEnabled && props.thermalBathMode !== 'all' && (
        <div className="face-contact-badge">
          {props.thermalWalls.map((wall, index) => (
            <span key={`${wall.axis}-${wall.positive}`} className={index === 1 ? 'secondary' : ''}>
              <i /> {thermalFaceLabel(wall)} · {wall.temperature.toLocaleString()} K
            </span>
          ))}
        </div>
      )}
      {props.trackParticle && (
        <div className="track-panel">
          <div className="track-panel-title"><i /> TRACKING PARTICLE #{props.trackedParticleIndex + 1}</div>
          <div className="track-data"><span>POSITION</span><b ref={trackPositionRef}>—</b></div>
          <div className="track-data"><span>SPEED</span><b ref={trackSpeedRef}>—</b></div>
          <div ref={collisionIndicatorRef} className="collision-indicator">○ NO RECENT COLLISION</div>
        </div>
      )}
      <div className="orientation-gizmo" aria-label="Camera-relative x, y, z axes">
        <svg viewBox="0 0 64 64" role="img">
          <circle cx="32" cy="32" r="2" />
          {(['x', 'y', 'z'] as const).map((axis, index) => (
            <g key={axis} className={`axis-${axis}`}>
              <line ref={(node) => { orientationLinesRef.current[index] = node }} x1="32" y1="32" x2="32" y2="32" />
              <text ref={(node) => { orientationLabelsRef.current[index] = node }} x="32" y="35">{axis}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="length-reference" aria-label="Live physical length reference">
        <span ref={lengthReferenceLabelRef}>—</span>
        <i ref={lengthReferenceBarRef} />
      </div>
      <div
        className={`color-key ${props.brownianEnabled && props.brownianFocus ? 'brownian-key' : props.trackParticle ? 'tracking-key' : props.highlightBand ? 'band-threshold-key' : props.highlightFast && props.highlightCold ? 'dual-threshold-key' : props.highlightFast ? 'threshold-key' : props.highlightCold ? 'cold-threshold-key' : ''}`}
        aria-label={props.brownianEnabled && props.brownianFocus ? 'Brownian tracer color legend' : props.trackParticle ? 'Tracked particle color legend' : props.highlightBand ? 'Speed band color legend' : 'Particle speed color legend'}
      >
        <span>{props.brownianEnabled && props.brownianFocus ? 'gas' : props.trackParticle ? 'others' : props.highlightBand ? `${Math.max(0, props.bandCenter - props.bandHalfWidth)}` : props.highlightCold ? `< ${props.coldSpeedThreshold} m/s` : props.highlightFast ? `≤ ${props.speedThreshold} m/s` : 'slow'}</span>
        <i />
        <span>{props.brownianEnabled && props.brownianFocus ? 'tracer' : props.trackParticle ? 'tracked' : props.highlightBand ? `${props.bandCenter + props.bandHalfWidth} m/s` : props.highlightFast ? `> ${props.speedThreshold} m/s` : props.highlightCold ? 'warmer' : 'fast'}</span>
      </div>
    </div>
  )
}
