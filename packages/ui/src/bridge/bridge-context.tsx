import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";
import type {
  CommandResult,
  CompanionBridge,
  CompanionCommand,
  CompanionSnapshot,
} from "@rose-enhanced/contracts";

export interface BridgeStore {
  getSnapshot: () => CompanionSnapshot;
  subscribe: (listener: () => void) => () => void;
  dispatch: (command: CompanionCommand) => Promise<CommandResult>;
  bridge: CompanionBridge;
}

const BridgeContext = createContext<BridgeStore | null>(null);

export function createBridgeStore(bridge: CompanionBridge, initialSnapshot: CompanionSnapshot): BridgeStore {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  let unsubscribeBridge: (() => void) | null = null;

  const refresh = async (): Promise<void> => {
    const next = await bridge.getSnapshot();
    if (next.revision < snapshot.revision) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      if (!unsubscribeBridge) {
        unsubscribeBridge = bridge.subscribe(() => void refresh());
        void refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeBridge?.();
          unsubscribeBridge = null;
        }
      };
    },
    dispatch: async (command) => {
      const result = await bridge.dispatch(command);
      await refresh();
      return result;
    },
    bridge,
  };
}

export function BridgeProvider({
  bridge,
  initialSnapshot,
  children,
}: {
  bridge: CompanionBridge;
  initialSnapshot: CompanionSnapshot;
  children: ReactNode;
}) {
  const storeRef = useRef<BridgeStore | null>(null);
  if (!storeRef.current) storeRef.current = createBridgeStore(bridge, initialSnapshot);

  return <BridgeContext.Provider value={storeRef.current}>{children}</BridgeContext.Provider>;
}

function useBridgeStore(): BridgeStore {
  const store = useContext(BridgeContext);
  if (!store) throw new Error("BridgeProvider is missing from the component tree.");
  return store;
}

export function useCompanionSnapshot(): CompanionSnapshot {
  const store = useBridgeStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useCompanionCommand() {
  const store = useBridgeStore();
  return useCallback((command: CompanionCommand) => store.dispatch(command), [store]);
}

export function useCompanionBridge(): CompanionBridge {
  return useBridgeStore().bridge;
}
