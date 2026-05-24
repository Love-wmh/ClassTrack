import type { StateCreator } from 'zustand'
import type { DataSlice } from './slices/dataSlice'
import type { UiSlice } from './slices/uiSlice'

export type ClassStore = DataSlice & UiSlice

export type StoreSlice<T> = StateCreator<ClassStore, [['zustand/immer', never]], [], T>
