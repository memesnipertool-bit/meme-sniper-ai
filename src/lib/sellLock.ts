/**
 * Global Sell Lock Manager
 * Prevents duplicate sell orders for the same token from concurrent systems
 * (auto-exit, manual sell, liquidity retry worker)
 */

// In-memory lock registry with timestamps
const activeSellLocks = new Map<string, { startedAt: number; source: string }>();

// Lock timeout: If a sell hasn't completed in 60 seconds, allow retry
const LOCK_TIMEOUT_MS = 60_000;

export type SellSource = 'auto_exit' | 'manual_sell' | 'liquidity_worker' | 'partial_retry';

/**
 * Attempt to acquire a sell lock for a token
 * @returns true if lock acquired, false if already locked
 */
export function acquireSellLock(tokenAddress: string, source: SellSource): boolean {
  const key = tokenAddress.toLowerCase();
  const existing = activeSellLocks.get(key);
  
  if (existing) {
    // Check if lock is stale (timed out)
    const elapsed = Date.now() - existing.startedAt;
    if (elapsed < LOCK_TIMEOUT_MS) {
      console.log(`[SellLock] BLOCKED: ${tokenAddress.slice(0, 8)}... already locked by ${existing.source} (${Math.round(elapsed / 1000)}s ago)`);
      return false;
    }
    // Lock is stale, we can take over
    console.log(`[SellLock] Stale lock from ${existing.source} expired, ${source} taking over`);
  }
  
  activeSellLocks.set(key, { startedAt: Date.now(), source });
  console.log(`[SellLock] ACQUIRED: ${tokenAddress.slice(0, 8)}... by ${source}`);
  return true;
}

/**
 * Release a sell lock after transaction completes (success or failure)
 */
export function releaseSellLock(tokenAddress: string): void {
  const key = tokenAddress.toLowerCase();
  const removed = activeSellLocks.delete(key);
  if (removed) {
    console.log(`[SellLock] RELEASED: ${tokenAddress.slice(0, 8)}...`);
  }
}

/**
 * Check if a token is currently being sold
 */
export function isSellLocked(tokenAddress: string): boolean {
  const key = tokenAddress.toLowerCase();
  const existing = activeSellLocks.get(key);
  
  if (!existing) return false;
  
  const elapsed = Date.now() - existing.startedAt;
  return elapsed < LOCK_TIMEOUT_MS;
}

/**
 * Get current lock status for debugging
 */
export function getSellLockStatus(tokenAddress: string): { locked: boolean; source?: string; elapsedMs?: number } {
  const key = tokenAddress.toLowerCase();
  const existing = activeSellLocks.get(key);
  
  if (!existing) return { locked: false };
  
  const elapsed = Date.now() - existing.startedAt;
  return {
    locked: elapsed < LOCK_TIMEOUT_MS,
    source: existing.source,
    elapsedMs: elapsed,
  };
}

/**
 * Clear all locks (for testing/reset scenarios)
 */
export function clearAllSellLocks(): void {
  activeSellLocks.clear();
  console.log('[SellLock] All locks cleared');
}

/**
 * Get count of active locks (for debugging)
 */
export function getActiveLockCount(): number {
  // Clean up stale locks first
  const now = Date.now();
  for (const [key, lock] of activeSellLocks.entries()) {
    if (now - lock.startedAt >= LOCK_TIMEOUT_MS) {
      activeSellLocks.delete(key);
    }
  }
  return activeSellLocks.size;
}
