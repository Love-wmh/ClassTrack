import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { NAV_ITEM_IDS, normalizeNavigationOrder, type NavItemId } from '~/features/layout/navigation'

type MobileNavigationStore = {
  order: NavItemId[]
  moveItem: (id: NavItemId, direction: -1 | 1) => void
  resetOrder: () => void
}

export const useMobileNavigationStore = create<MobileNavigationStore>()(
  persist(
    (set) => ({
      order: [...NAV_ITEM_IDS],
      moveItem: (id, direction) => {
        set((state) => {
          const order = normalizeNavigationOrder(state.order)
          const currentIndex = order.indexOf(id)
          const targetIndex = currentIndex + direction

          if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return { order }

          const nextOrder = [...order]
          ;[nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]]
          return { order: nextOrder }
        })
      },
      resetOrder: () => set({ order: [...NAV_ITEM_IDS] }),
    }),
    {
      name: 'class-track-mobile-navigation',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ order: state.order }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<MobileNavigationStore>),
        order: normalizeNavigationOrder((persistedState as Partial<MobileNavigationStore>)?.order || currentState.order),
      }),
    }
  )
)
