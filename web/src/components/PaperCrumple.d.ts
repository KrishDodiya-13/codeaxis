// Types for the React Bits PaperCrumple component (PaperCrumple.jsx, JS-CSS variant).
// The source stays plain JS as shipped by the registry; this file lets TS check usage.
import type { CSSProperties, JSX } from 'react'

export type PaperCrumpleState = 'flat' | 'holding' | 'crumpled' | 'creased'

export interface PaperCrumpleProps {
  /** Image printed on the paper. Required; remote images must allow CORS. */
  src: string
  alt?: string
  /** Image on the back of the sheet. Defaults to the front image. */
  backSrc?: string
  width?: number
  height?: number
  sceneHeight?: number
  imageFit?: 'cover' | 'contain'
  /** What happens on release: spring back flat, keep creases, or stay crumpled. */
  releaseBehavior?: 'restore' | 'creased' | 'stay'
  crumpleAmount?: number
  crumpleDuration?: number
  releaseDuration?: number
  foldCount?: number
  foldSharpness?: number
  wrinkleDepth?: number
  creaseStrength?: number
  paperColor?: string
  roughness?: number
  paperTexture?: number
  lightIntensity?: number
  lightAngle?: number
  shadow?: boolean
  shadowOpacity?: number
  draggable?: boolean
  dragRotation?: number
  dragRadius?: number
  returnToOrigin?: boolean
  rotation?: number
  seed?: number
  detail?: number
  disabled?: boolean
  /** Change this value to flatten the paper again. */
  resetKey?: number
  onStateChange?: (state: PaperCrumpleState) => void
  onError?: (error: Error) => void
  className?: string
  style?: CSSProperties
}

declare function PaperCrumple(props: PaperCrumpleProps): JSX.Element
export default PaperCrumple
