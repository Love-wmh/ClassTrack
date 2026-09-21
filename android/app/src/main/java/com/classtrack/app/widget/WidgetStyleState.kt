package com.classtrack.app.widget

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import com.classtrack.app.WidgetStyleConfig

/**
 * 每个 widget 实例的展示配置（布局样式 + 已上完的课怎么处理 + 大格子表现）的读写。
 *
 * 用 Glance 官方状态容器（`PreferencesGlanceStateDefinition`）而不是自建 SharedPreferences 键：
 * 它天然按 `GlanceId` 分片，能在实例被删除时精准清理，不会因为 `appWidgetId` 被复用而让新实例
 * 继承上一个实例的样式。
 *
 * 这里只负责读写；值的合法性判断（脏值回退默认）放在 [WidgetStyleConfig] 里，因为那是纯逻辑，
 * 可以脱离 Android 框架被单测覆盖。
 */
internal object WidgetStyleState {
    private val layoutStyleKey = stringPreferencesKey(WidgetStyleConfig.KEY_LAYOUT_STYLE)
    private val finishedPolicyKey = stringPreferencesKey(WidgetStyleConfig.KEY_FINISHED_POLICY)
    private val wideLayoutKey = stringPreferencesKey(WidgetStyleConfig.KEY_WIDE_LAYOUT)


    /**
     * 读取某个实例的配置。
     *
     * @param context 任意 Context。
     * @param glanceId 该实例的 Glance id。
     * @return 配置；从未写入过或值已损坏时返回默认配置，绝不会为 `null`。
     */
    suspend fun read(context: Context, glanceId: GlanceId): WidgetStyleConfig {
        val preferences = getAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId)
        return WidgetStyleConfig.parse(
            preferences[layoutStyleKey],
            preferences[finishedPolicyKey],
            preferences[wideLayoutKey]
        )
    }

    /**
     * 写入某个实例的配置。
     *
     * @param context 任意 Context。
     * @param glanceId 该实例的 Glance id。
     * @param config 要保存的配置。
     */
    suspend fun write(context: Context, glanceId: GlanceId, config: WidgetStyleConfig) {
        // 用「可变」重载：三参数的版本要求 lambda 返回一个新的 Preferences，这里要的是就地修改。
        updateAppWidgetState(context, glanceId) { preferences ->
            preferences[layoutStyleKey] = config.layoutStyleStorageValue()
            preferences[finishedPolicyKey] = config.finishedPolicyStorageValue()
            preferences[wideLayoutKey] = config.wideLayoutStorageValue()
        }
    }

    /**
     * 清除某个实例的配置。
     *
     * 实例被删除时调用：`appWidgetId` 会被系统复用，残留的键会让新实例莫名继承旧样式。
     *
     * @param context 任意 Context。
     * @param appWidgetId 被删除的实例 id。
     */
    suspend fun clear(context: Context, appWidgetId: Int) {
        val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
        updateAppWidgetState(context, glanceId) { preferences ->
            // 三个键都要删：`appWidgetId` 会被系统复用，漏删一个就会让新实例继承旧样式。
            preferences.remove(layoutStyleKey)
            preferences.remove(finishedPolicyKey)
            preferences.remove(wideLayoutKey)

        }
    }

}
