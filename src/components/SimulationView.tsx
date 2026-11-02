import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { COLLISION_DIAMETERS_ANGSTROM, GasSimulation, thermalSigma } from '../physics'
import { formatScaleRatio, getScaleComparison, SCALE_COMPARISONS, ScaleComparisonId, ScaleComparisonShape } from '../scaleComparisons'

interface SimulationViewProps {
  simulation: GasSimulation
  playing: boolean
  speedMultiplier: number
  thermostatEnabled: boolean
  thermostatRate: number
  singleFaceBath: boolean
  dsmcEnabled: boolean
  collisionDiameterAngstrom: number
  particleMarkerDiameterAngstrom: number
  particleFuzziness: number
  particleOpacity: number
  scaleComparison: ScaleComparisonId
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
    gl_PointSize = clamp(pointScale * emphasis * (3.2 / -mvPosition.z), 0.75, 40.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vHighlight;
  uniform float unfocusedOpacity;
  uniform float particleFuzziness;
  uniform float particleOpacity;
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;
    float edgeSoftness = mix(0.005, 0.24, particleFuzziness);
    float edgeAlpha = 1.0 - smoothstep(0.5 - edgeSoftness, 0.5, radius);
    float glow = smoothstep(0.5, 0.05, radius);
    float alpha = particleOpacity * mix(unfocusedOpacity, 1.0, vHighlight) * (0.42 + 0.58 * glow) * edgeAlpha;
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

function comparisonMaterial(color: number, opacity = 0.82): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.14,
    shininess: 52,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}

function cylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 8,
): THREE.Mesh {
  const direction = end.clone().sub(start)
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments),
    material,
  )
  cylinder.position.copy(start).add(end).multiplyScalar(0.5)
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return cylinder
}

function createRedBloodCell(): THREE.Group {
  const group = new THREE.Group()
  const profile: THREE.Vector2[] = []
  const segments = 18
  for (let i = 0; i <= segments; i += 1) {
    const radius = 0.5 * i / segments
    const thickness = 0.045 + 0.13 * Math.sin(Math.PI * i / segments) ** 0.72
    profile.push(new THREE.Vector2(radius, thickness))
  }
  for (let i = segments; i >= 0; i -= 1) {
    const radius = 0.5 * i / segments
    const thickness = 0.045 + 0.13 * Math.sin(Math.PI * i / segments) ** 0.72
    profile.push(new THREE.Vector2(radius, -thickness))
  }
  const cell = new THREE.Mesh(new THREE.LatheGeometry(profile, 52), comparisonMaterial(0xd84655, 0.78))
  cell.rotation.z = -0.18
  group.add(cell)
  return group
}

function createBacterium(): THREE.Group {
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.54, 8, 20), comparisonMaterial(0x62c99a, 0.8))
  body.rotation.z = Math.PI / 2
  group.add(body)

  const flagellumMaterial = new THREE.MeshBasicMaterial({ color: 0x86e0b8, transparent: true, opacity: 0.66 })
  for (let strand = 0; strand < 3; strand += 1) {
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 18; i += 1) {
      const progress = i / 18
      points.push(new THREE.Vector3(
        -0.5 - progress * 0.56,
        0.08 * Math.sin(progress * Math.PI * 4 + strand * 2.1),
        (strand - 1) * 0.055,
      ))
    }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, 0.009, 5, false), flagellumMaterial))
  }
  return group
}

function createCoronavirus(): THREE.Group {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 3), comparisonMaterial(0xc99d49, 0.7)))
  const stemMaterial = comparisonMaterial(0xe4bb66, 0.85)
  const tipMaterial = comparisonMaterial(0xf0cd82, 0.9)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < 26; i += 1) {
    const y = 1 - (i / 25) * 2
    const radial = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = goldenAngle * i
    const direction = new THREE.Vector3(Math.cos(angle) * radial, y, Math.sin(angle) * radial)
    const stemStart = direction.clone().multiplyScalar(0.33)
    const stemEnd = direction.clone().multiplyScalar(0.48)
    group.add(cylinderBetween(stemStart, stemEnd, 0.014, stemMaterial, 6))
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), tipMaterial)
    tip.position.copy(direction).multiplyScalar(0.52)
    group.add(tip)
  }
  return group
}

function createDna(): THREE.Group {
  const group = new THREE.Group()
  const strandMaterials = [comparisonMaterial(0x57c8f2, 0.9), comparisonMaterial(0xff799c, 0.9)]
  const strandPoints: THREE.Vector3[][] = [[], []]
  for (let strand = 0; strand < 2; strand += 1) {
    for (let i = 0; i <= 64; i += 1) {
      const progress = i / 64
      const angle = progress * Math.PI * 4 + strand * Math.PI
      strandPoints[strand].push(new THREE.Vector3(0.5 * Math.cos(angle), (progress - 0.5) * 1.38, 0.5 * Math.sin(angle)))
    }
    group.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandPoints[strand]), 96, 0.035, 7, false),
      strandMaterials[strand],
    ))
  }
  const rungMaterial = comparisonMaterial(0xd7e7df, 0.56)
  for (let i = 4; i < 64; i += 6) {
    group.add(cylinderBetween(strandPoints[0][i], strandPoints[1][i], 0.017, rungMaterial, 6))
  }
  group.rotation.z = -0.14
  return group
}

function createBuckyball(): THREE.Group {
  const group = new THREE.Group()
  const geometry = new THREE.IcosahedronGeometry(0.5, 2)
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x82cbd5, transparent: true, opacity: 0.06, depthWrite: false })))
  group.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 12),
    new THREE.LineBasicMaterial({ color: 0xa5e2e8, transparent: true, opacity: 0.78 }),
  ))
  group.rotation.set(0.15, 0.25, 0)
  return group
}

function createPlatelet(): THREE.Group {
  const group = new THREE.Group()
  const platelet = new THREE.Mesh(new THREE.SphereGeometry(0.5, 30, 18), comparisonMaterial(0xc881cf, 0.72))
  platelet.scale.set(1, 0.22, 0.72)
  platelet.rotation.z = 0.16
  group.add(platelet)
  for (let i = 0; i < 7; i += 1) {
    const granule = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 3) * 0.008, 7, 5), comparisonMaterial(0xf0b3ea, 0.8))
    const angle = i * 2.31
    granule.position.set(Math.cos(angle) * 0.27, 0.105, Math.sin(angle) * 0.19)
    group.add(granule)
  }
  return group
}

function createAtpSynthase(): THREE.Group {
  const group = new THREE.Group()
  const proteinMaterial = comparisonMaterial(0xe3aa51, 0.82)
  const rotorMaterial = comparisonMaterial(0x77c5ce, 0.82)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 16), proteinMaterial)
  head.scale.y = 0.72
  head.position.y = 0.26
  group.add(head)
  group.add(cylinderBetween(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 0.18, 0), 0.055, rotorMaterial, 10))
  const membraneRotor = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 20), proteinMaterial)
  membraneRotor.position.y = -0.34
  group.add(membraneRotor)
  const membrane = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.035, 32), comparisonMaterial(0x557e91, 0.25))
  membrane.position.y = -0.34
  group.add(membrane)
  return group
}

function createCarbonNanotube(): THREE.Group {
  const group = new THREE.Group()
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1.45, 18, 8, true),
    new THREE.MeshBasicMaterial({ color: 0xa7c3cc, wireframe: true, transparent: true, opacity: 0.76 }),
  )
  tube.rotation.z = Math.PI / 2
  group.add(tube)
  return group
}

function createComparisonModel(shape: ScaleComparisonShape): THREE.Group {
  switch (shape) {
    case 'red-blood-cell': return createRedBloodCell()
    case 'bacterium': return createBacterium()
    case 'coronavirus': return createCoronavirus()
    case 'dna': return createDna()
    case 'buckyball': return createBuckyball()
    case 'platelet': return createPlatelet()
    case 'atp-synthase': return createAtpSynthase()
    case 'carbon-nanotube': return createCarbonNanotube()
  }
}

function disposeComparisonModels(root: THREE.Object3D): void {
  root.traverse((child) => {
    const renderable = child as THREE.Mesh | THREE.LineSegments
    if (renderable.geometry) renderable.geometry.dispose()
    if (renderable.material) {
      const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material]
      materials.forEach((item) => item.dispose())
    }
  })
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
    scene.add(new THREE.HemisphereLight(0x9bdde5, 0x142128, 1.25))
    const comparisonLight = new THREE.DirectionalLight(0xffffff, 1.3)
    comparisonLight.position.set(2, 3, 2)
    scene.add(comparisonLight)
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
        particleFuzziness: { value: props.particleFuzziness },
        particleOpacity: { value: props.particleOpacity },
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

    const comparisonRoot = new THREE.Group()
    const comparisonModels = new Map<ScaleComparisonShape, THREE.Group>()
    const comparisonBounds = new Map<ScaleComparisonShape, THREE.Box3>()
    for (const comparison of SCALE_COMPARISONS) {
      const model = createComparisonModel(comparison.id)
      comparisonBounds.set(comparison.id, new THREE.Box3().setFromObject(model))
      model.visible = false
      comparisonModels.set(comparison.id, model)
      comparisonRoot.add(model)
    }
    scene.add(comparisonRoot)

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
        const physicalDt = wallDt * 2e-10 * current.speedMultiplier
        current.simulation.advance(
          physicalDt,
          current.thermostatEnabled ? current.thermostatRate : 0,
          current.singleFaceBath,
          current.dsmcEnabled,
          current.collisionDiameterAngstrom * 1e-10,
        )
        ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      }

      // Box-length scaling is visual only here: physics remains in normalized
      // coordinates, while the larger grid makes a shorter physical box read as
      // smaller. Marker scaling compounds with, but does not alter, the user's
      // nominal marker-size control.
      const boxVisualScale = Math.max(1, Math.min(100, 1e-6 / current.simulation.boxLengthMeters))
      const automaticMarkerScale = Math.sqrt(boxVisualScale)
      updateReferenceGrid(boxVisualScale)
      const populationScale = Math.max(0.32, Math.min(2.2, Math.sqrt(10_000 / current.simulation.count)))
      const markerDiameterScale = current.particleMarkerDiameterAngstrom / COLLISION_DIAMETERS_ANGSTROM.Argon
      material.uniforms.pointScale.value = 0.72 * Math.min(window.devicePixelRatio, 1.75) * markerDiameterScale * populationScale * automaticMarkerScale
      material.uniforms.unfocusedOpacity.value = current.unfocusedOpacity
      material.uniforms.particleFuzziness.value = current.particleFuzziness
      material.uniforms.particleOpacity.value = current.particleOpacity
      trackedMarker.scale.setScalar(Math.max(0.5, markerDiameterScale * automaticMarkerScale))
      ;(trackedMarker.material as THREE.MeshBasicMaterial).opacity = 0.95 * current.particleOpacity
      thermalFace.visible = current.thermostatEnabled && current.singleFaceBath

      const selectedComparison = getScaleComparison(current.scaleComparison)
      for (const [id, model] of comparisonModels) model.visible = id === selectedComparison?.id
      if (selectedComparison) {
        const model = comparisonModels.get(selectedComparison.id)
        const bounds = comparisonBounds.get(selectedComparison.id)
        if (model && bounds) {
          const physicalRatio = selectedComparison.sizeMeters / current.simulation.boxLengthMeters
          const displayScale = THREE.MathUtils.clamp(0.42 + 0.12 * Math.log10(physicalRatio), 0.18, 0.65)
          model.scale.setScalar(displayScale)
          model.position.set(
            0.62 - bounds.min.x * displayScale,
            -0.495 - bounds.min.y * displayScale,
            0.08,
          )
        }
      }

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
      disposeReferenceGrid(coarseGrid)
      disposeReferenceGrid(fineGrid)
      disposeComparisonModels(comparisonRoot)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [props.simulation])

  const selectedComparison = getScaleComparison(props.scaleComparison)
  const comparisonRatio = selectedComparison ? selectedComparison.sizeMeters / props.simulation.boxLengthMeters : 0

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
      <div className="scale-note">{(props.simulation.boxLengthMeters * 1e6).toFixed(2)} μm box · particles enlarged for visibility</div>
      {selectedComparison && (
        <div className="scale-comparison-badge">
          <span>REAL-WORLD COMPARISON</span>
          <b>{selectedComparison.label}</b>
          <small>{selectedComparison.sizeLabel} {selectedComparison.measurement} · {formatScaleRatio(comparisonRatio)} box</small>
          <i>adaptive display scale</i>
        </div>
      )}
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
