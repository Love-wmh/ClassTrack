import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.classtrack.app',
  appName: 'ClassTrack',
  webDir: 'build/client',
  server: {
    androidScheme: 'https',
  },
}

export default config
