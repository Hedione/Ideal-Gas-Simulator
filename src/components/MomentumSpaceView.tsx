import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ATOMIC_MASS_UNIT, BOLTZMANN, GasSimulation, thermalSigma } from '../physics'

interface MomentumSpaceViewProps {
  simulation: GasSimulation
}

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
    let geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3))
    const material = new THREE.PointsMaterial({
      color: 0x72dbe8,
      size: 0.014,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.42,
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
        geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3))
        cloud.geometry = geometry
        previousGeometry.dispose()
      }
      const sigma = Math.max(1e-12, thermalSigma(simulation.targetTemperature, simulation.massAmu))
      const normalization = 5 * sigma
      const densityScale = Math.max(0.45, Math.min(1.8, Math.sqrt(10_000 / simulation.count)))
      material.size = 0.014 * densityScale
      material.opacity = Math.max(0.2, Math.min(0.7, 0.42 * densityScale))
      for (let index = 0; index < coordinates.length; index += 1) {
        coordinates[index] = simulation.velocities[index] / normalization
      }
      ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
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
