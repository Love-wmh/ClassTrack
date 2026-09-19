package com.classtrack.app.widget

import androidx.compose.runtime.Composable
import androidx.glance.GlanceModifier
import androidx.glance.text.Text
import androidx.work.WorkManager

/**
 * 工具链探针（临时文件，P4 写完真正的 widget 后删除）。
 *
 * 本模块原本是纯 Java 的 Capacitor 容器。引入 Jetpack Glance 之后需要同时具备：
 * 1. Kotlin 源码编译能力；
 * 2. Compose 编译器插件（`@Composable` 必须经过它处理才能编译）；
 * 3. Glance 与 WorkManager 的依赖可解析。
 *
 * 这里把这三点各用一个最小引用固定下来，让工具链问题在写业务代码之前就暴露出来。
 */
internal object WidgetToolchainProbe {
  const val SNAPSHOT_SCHEMA_VERSION = 1

  /** WorkManager 可解析（刷新排程会用到）。 */
  fun workManagerClass(): Class<WorkManager> = WorkManager::class.java

  /** Compose 编译器插件可工作；Glance 的 Composable 与 Modifier 可解析。 */
  @Composable
  fun ProbeContent() {
    Text(text = "probe", modifier = GlanceModifier)
  }
}
