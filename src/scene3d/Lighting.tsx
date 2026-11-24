import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { lightRig, type Daylight } from './daylight'
import { LIGHT, type LightBounds } from './lightParams'

/**
 * Свет интерактивной сцены по времени суток (этап 20): полусфера неба и один направленный источник —
 * солнце днём, луна ночью, — с мягкими тенями по размеру комнаты. Направление, цвет и сила приходят из daylight.ts,
 * поэтому тени меняются вместе с положением солнца, а «Качественный снимок» читает то же значение из сцены.
 */
export function Lighting({ bounds, daylight }: { bounds: LightBounds; daylight: Daylight }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const { direction, color, intensity } = daylight.light
  const rig = useMemo(() => lightRig(bounds, direction), [bounds, direction])
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    gl.toneMapping = LIGHT.toneMapping
    gl.toneMappingExposure = LIGHT.toneMappingExposure
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.shadowMap.type = THREE.PCFSoftShadowMap
  }, [gl])
  useEffect(() => { target.position.set(...rig.target); scene.add(target); return () => { scene.remove(target) } }, [target, scene, rig])
  const r = rig.radius
  // Данные для «Качественного снимка»: небо и сила света этого часа.
  useEffect(() => {
    scene.userData.daylight = { skyTop: daylight.sky.top, skyHorizon: daylight.sky.horizon, hour: daylight.hour, intensityScale: intensity / LIGHT.sunIntensity, environmentIntensity: daylight.environmentIntensity }
  }, [scene, daylight, intensity])
  return (
    <>
      <hemisphereLight color={daylight.hemisphere.sky} groundColor={daylight.hemisphere.ground} intensity={daylight.hemisphere.intensity} />
      <directionalLight
        name="sun" position={rig.position} target={target} color={color} intensity={intensity}
        castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-radius={4}
      >
        <orthographicCamera attach="shadow-camera" args={[-r, r, r, -r, 0.5, (r * 3 + 6) * 2 + 10]} />
      </directionalLight>
    </>
  )
}
