import { Capacitor } from '@capacitor/core'

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform()
}
