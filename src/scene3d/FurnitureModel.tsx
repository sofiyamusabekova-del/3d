import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { CatalogItem } from '../domain/types'
import { cmToScene } from '../geometry/units'
import { registerModelCacheClear, useModelStatus } from './modelStatus'

registerModelCacheClear((url) => useGLTF.clear(url))

/** Граница ошибки: падение загрузки одной модели не роняет сцену, причина попадает в статус моделей. */
class ModelBoundary extends Component<{ itemId: string; children: ReactNode; fallback: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) } }
  componentDidCatch(e: unknown) { useModelStatus.getState().fail(this.props.itemId, e instanceof Error ? e.message : String(e)) }
  render() { return this.state.error ? this.props.fallback : this.props.children }
}

/** Указатель на неудачу: красный каркас по габариту (это сообщение об ошибке, а не «модель»). */
function ErrorBox({ item }: { item: CatalogItem }) {
  return (
    <mesh position={[0, cmToScene(item.heightCm) / 2, 0]} name="model-error">
      <boxGeometry args={[cmToScene(item.widthCm), cmToScene(item.heightCm), cmToScene(item.depthCm)]} />
      <meshBasicMaterial color="#ff5d5d" wireframe />
    </mesh>
  )
}

/** Пока модель грузится: бледный объём по габариту. */
function LoadingBox({ item }: { item: CatalogItem }) {
  return (
    <mesh position={[0, cmToScene(item.heightCm) / 2, 0]} name="model-loading">
      <boxGeometry args={[cmToScene(item.widthCm), cmToScene(item.heightCm), cmToScene(item.depthCm)]} />
      <meshBasicMaterial color="#9aa3b5" transparent opacity={0.25} depthWrite={false} />
    </mesh>
  )
}

function Loaded({ item, selected, onReady }: { item: CatalogItem; selected: boolean; onReady?: () => void }) {
  const gltf = useGLTF(item.modelUrl, false)
  // Геометрия и текстуры общие для всех экземпляров (кеш по URL); материалы у каждого экземпляра свои,
  // чтобы подсветка одного предмета не меняла другие (SPEC §12).
  const { scene, materials } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    const mats: THREE.MeshStandardMaterial[] = []
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone()
      mats.push(mesh.material as THREE.MeshStandardMaterial)
    })
    return { scene: clone, materials: mats }
  }, [gltf])
  useEffect(() => { useModelStatus.getState().ok(item.id); onReady?.() }, [item.id, onReady])
  useEffect(() => {
    for (const m of materials) {
      m.emissive.set(selected ? '#1d4f9c' : '#000000')
      m.emissiveIntensity = selected ? 0.55 : 0
    }
  }, [materials, selected])
  useEffect(() => () => { for (const m of materials) m.dispose() }, [materials])
  return <primitive object={scene} />
}

/**
 * Модель предмета каталога, поставленная началом координат в центр основания (так подготовлены GLB).
 * Ошибка загрузки показывается красным каркасом; повтор — через useModelStatus.retry.
 */
export function FurnitureModel({ item, selected = false, onReady }: { item: CatalogItem; selected?: boolean; onReady?: () => void }) {
  const attempt = useModelStatus((s) => s.attempts[item.id] ?? 0)
  return (
    <ModelBoundary key={attempt} itemId={item.id} fallback={<ErrorBox item={item} />}>
      <Suspense fallback={<LoadingBox item={item} />}>
        <Loaded item={item} selected={selected} onReady={onReady} />
      </Suspense>
    </ModelBoundary>
  )
}
