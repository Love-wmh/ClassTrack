import assert from 'node:assert/strict'
import test from 'node:test'

import { assertAssetMapEqual, assertNativeShellContract, collectLocalAssetReferences } from './check-android-assets.js'

test('requires a route-matching native shell boot path', () => {
  assert.doesNotThrow(() => assertNativeShellContract())
})

test('collects only local shell asset references', () => {
  assert.deepEqual(
    collectLocalAssetReferences(
      '<link href="/assets/app.css?v=1"><script src="/assets/app.js#fragment"></script><link href="/icon.png">' +
        '<script type="module">import "/assets/runtime.js"; import("/assets/lazy.js"); import thing from "/assets/from.js"</script>'
    ),
    ['assets/app.css', 'assets/app.js', 'assets/from.js', 'assets/lazy.js', 'assets/runtime.js', 'icon.png']
  )
})

test('rejects remote shell asset references without echoing query or fragment data', () => {
  assert.throws(
    () => collectLocalAssetReferences('<script src="https://example.invalid/app.js?token=secret#fragment"></script>'),
    (error) => {
      assert.match(error.message, /non-local shell asset reference/)
      assert.doesNotMatch(error.message, /token=secret|fragment/)
      return true
    }
  )
})

test('detects stale, missing, or extra APK entries', () => {
  const currentAssets = new Map([
    ['index.html', Buffer.from('current')],
    ['assets/app.js', Buffer.from('current bundle')],
  ])

  assert.doesNotThrow(() => assertAssetMapEqual('APK assets/public', currentAssets, new Map(currentAssets)))
  assert.doesNotThrow(() =>
    assertAssetMapEqual('Capacitor synced assets', currentAssets, new Map([...currentAssets, ['cordova.js', Buffer.from('generated')]]), {
      allowedExtraPaths: ['cordova.js'],
    })
  )
  assert.throws(
    () =>
      assertAssetMapEqual(
        'APK assets/public',
        currentAssets,
        new Map([
          ['index.html', Buffer.from('old')],
          ['assets/old.js', Buffer.from('old bundle')],
        ])
      ),
    /APK assets\/public does not match the current web build.*missing\(1\)=assets\/app.js.*extra\(1\)=assets\/old.js.*changed\(1\)=index.html/
  )
})
