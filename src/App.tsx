import { lazy, Suspense } from 'react'
import { useStart } from './scenario/start'
import { StartMenu } from './ui/StartMenu'
import { Wizard } from './ui/Wizard'

// Служебные экраны с 3D грузятся отдельно: мастеру они не нужны (этап 28).
const ModelPreview = lazy(() => import('./ui/ModelPreview').then((m) => ({ default: m.ModelPreview })))
const TechPrototype = lazy(() => import('./ui/TechPrototype').then((m) => ({ default: m.TechPrototype })))

export default function App() {
  const startShown = useStart((s) => s.shown)
  const params = new URLSearchParams(window.location.search)
  // Служебные адреса: /?tech — техническая сцена этапа 4, /?preview=<id> — снимок предмета для карточки.
  const preview = params.get('preview')
  if (preview) return <Suspense fallback={null}><ModelPreview id={preview} /></Suspense>
  return params.has('tech') ? <Suspense fallback={null}><TechPrototype /></Suspense> : startShown ? <StartMenu /> : <Wizard />
}
