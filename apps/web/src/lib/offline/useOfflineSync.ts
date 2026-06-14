"use client";

import { useEffect, useState } from "react";
import { syncer, type SyncSnapshot } from "./syncer";

export function useOfflineSync(): SyncSnapshot {
  const [snap, setSnap] = useState<SyncSnapshot>(syncer.getSnapshot());
  useEffect(() => {
    const unsub = syncer.subscribe(setSnap);
    syncer.init();
    void syncer.refresh();
    return unsub;
  }, []);
  return snap;
}
