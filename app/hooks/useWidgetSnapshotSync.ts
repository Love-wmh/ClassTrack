import { useEffect, useRef } from 'react'
import { addWidgetSnapshotResumedListener, isNativeWidgetSnapshotAvailable, widgetSnapshotPlugin } from '~/lib/native-widget-snapshot'
import { buildWidgetSnapshot, getWidgetSnapshotByteLength, serializeWidgetSnapshot, WIDGET_SNAPSHOT_MAX_BYTES } from '~/lib/widget-snapshot'
import { useClassStore } from '~/store'

/** 数据连续变化时的合并窗口：避免一次导入触发十几次桥调用。 */
const PUSH_DEBOUNCE_MS = 1500

/**
 * 把课表快照同步到原生侧的小工具。
 *
 * 三条触发路径合并在这里，且**只有一处实现**：
 * 1. 启动后推一次（覆盖首次安装、以及「上次推送后应用被杀」的情况）；
 * 2. store 里与课表有关的字段变化后去抖推送；
 * 3. 原生侧 `handleOnResume()` 发出的 `resumed` 事件 —— 应用回到前台时兜底一次。
 *
 * 非 Android 原生环境整体 no-op：浏览器与 PWA 上 `isNativeWidgetSnapshotAvailable()`
 * 为假，effect 直接返回，也因此不会产生任何 console 报错。
 */
export function useWidgetSnapshotSync() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isNativeWidgetSnapshotAvailable()) return

    /**
     * 从 store 的当前状态生成并推送快照。
     *
     * 推失败只在控制台留一条告警：小工具同步是增强能力，不能因为一次桥调用失败
     * 就打断用户正在做的导入或编辑。
     */
    const push = () => {
      const { classes, currentWeek, firstWeekStartDate } = useClassStore.getState()
      const snapshot = buildWidgetSnapshot({ classes, currentWeek, firstWeekStartDate }, new Date())
      const payload = serializeWidgetSnapshot(snapshot)

      if (getWidgetSnapshotByteLength(payload) > WIDGET_SNAPSHOT_MAX_BYTES) {
        // 宁可不同步也不推一个注定被原生拒绝的负载，避免让 widget 停在旧数据上而无从解释。
        console.warn('课表数据过大，已跳过桌面小工具同步')
        return
      }

      void widgetSnapshotPlugin.pushSnapshot({ snapshotJson: payload }).catch((error: unknown) => {
        console.warn('桌面小工具同步失败', error)
      })
    }

    const schedulePush = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(push, PUSH_DEBOUNCE_MS)
    }

    push()

    // 手动比较这几个字段的引用：不为了单个消费方给 store 引入 subscribeWithSelector 中间件。
    let previous = selectSyncedFields(useClassStore.getState())
    const unsubscribe = useClassStore.subscribe((state) => {
      const next = selectSyncedFields(state)
      if (
        next.classes === previous.classes &&
        next.currentWeek === previous.currentWeek &&
        next.firstWeekStartDate === previous.firstWeekStartDate &&
        next.currentSemesterId === previous.currentSemesterId &&
        next.semesters === previous.semesters &&
        next.isInitialized === previous.isInitialized
      ) {
        return
      }
      previous = next
      schedulePush()
    })

    let listener: { remove: () => Promise<void> } | null = null
    void addWidgetSnapshotResumedListener(push).then((handle) => {
      listener = handle
    })

    return () => {
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      void listener?.remove()
    }
  }, [])
}

/**
 * 取出参与同步比较的字段。
 *
 * `currentSemesterId` / `semesters` 也在内：切换或删除学期会改变课表内容，
 * 但扁平投影可能引用不变，只看 `classes` 会漏掉这类变化。
 *
 * @param state store 的当前状态。
 * @returns 用于引用比较的字段子集。
 */
function selectSyncedFields(state: ReturnType<typeof useClassStore.getState>) {
  return {
    classes: state.classes,
    currentWeek: state.currentWeek,
    firstWeekStartDate: state.firstWeekStartDate,
    currentSemesterId: state.currentSemesterId,
    semesters: state.semesters,
    isInitialized: state.isInitialized,
  }
}
