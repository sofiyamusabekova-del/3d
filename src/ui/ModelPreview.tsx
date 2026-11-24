import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { CATALOG } from '../catalog/catalog'
import { cmToScene } from '../geometry/units'
import { FurnitureModel } from '../scene3d/FurnitureModel'
import { StudioEnvironment } from '../scene3d/RoomScene'

/** Камера «три четверти» по габариту предмета. */
function Fit({ w, d, h }: { w: number; d: number; h: number }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const m = Math.max(cmToScene(w), cmToScene(d), cmToScene(h))
    camera.position.set(m * 1.25, cmToScene(h) * 0.55 + m * 0.7, m * 1.9)
    camera.lookAt(0, cmToScene(h) * 0.45, 0)
    camera.updateProjectionMatrix()
  }, [camera, w, d, h])
  return null
}

/**
 * Служебная страница `/?preview=<id>`: один предмет на нейтральном фоне. Из неё скрипт
 * `scripts/catalog/previews.mjs` снимает превью карточек; пользователю не показывается.
 */
export function ModelPreview({ id }: { id: string }) {
  const item = CATALOG[id]
  const [ready, setReady] = useState(false)
  if (!item) return <div>Нет предмета {id}</div>
  return (
    <div data-testid="model-preview" data-ready={ready} style={{ width: 256, height: 256, background: '#2a2e38' }}>
      <Canvas camera={{ fov: 32, near: 0.05, far: 50 }} gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <hemisphereLight args={['#ffffff', '#6b6f7a', 0.9]} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <StudioEnvironment />
        <Fit w={item.widthCm} d={item.depthCm} h={item.heightCm} />
        <FurnitureModel item={item} onReady={() => setReady(true)} />
      </Canvas>
    </div>
  )
}
