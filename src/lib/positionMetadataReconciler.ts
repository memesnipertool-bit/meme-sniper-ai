/**
 * Position Metadata Reconciler
 * 
 * Reconciles token names and symbols between active positions and scanner pools.
 * This ensures that "Active Trades" display the correct token names from the pools
 * that triggered the trades.
 * 
 * CRITICAL: This module now persists enriched metadata back to the database,
 * ensuring all tabs (Active, Waiting, Pools) show consistent token names.
 */

import { isPlaceholderTokenText, fetchDexScreenerTokenMetadata } from './dexscreener';
import { supabase } from '@/integrations/supabase/client';

// Interface for pool data from scanner
export interface PoolData {
  address: string;
  symbol: string;
  name: string;
}

// Interface for position to reconcile
export interface PositionForReconcile {
  id: string;
  token_address: string;
  token_symbol: string | null;
  token_name: string | null;
}

/**
 * Reconcile position metadata with pool data
 * Returns updated positions with metadata from matching pools
 */
export function reconcilePositionsWithPools<T extends PositionForReconcile>(
  positions: T[],
  pools: PoolData[]
): T[] {
  if (positions.length === 0 || pools.length === 0) {
    return positions;
  }

  // Create a map of pool data by address for quick lookup
  const poolMap = new Map<string, PoolData>();
  for (const pool of pools) {
    // Only add if pool has valid (non-placeholder) metadata
    if (!isPlaceholderTokenText(pool.symbol) || !isPlaceholderTokenText(pool.name)) {
      poolMap.set(pool.address, pool);
    }
  }

  if (poolMap.size === 0) {
    return positions;
  }

  // Update positions with pool metadata
  return positions.map((position) => {
    const pool = poolMap.get(position.token_address);
    if (!pool) {
      return position;
    }

    // Only update if position has placeholder metadata and pool has real metadata
    const needsSymbolUpdate = isPlaceholderTokenText(position.token_symbol) && !isPlaceholderTokenText(pool.symbol);
    const needsNameUpdate = isPlaceholderTokenText(position.token_name) && !isPlaceholderTokenText(pool.name);

    if (!needsSymbolUpdate && !needsNameUpdate) {
      return position;
    }

    return {
      ...position,
      token_symbol: needsSymbolUpdate ? pool.symbol : position.token_symbol,
      token_name: needsNameUpdate ? pool.name : position.token_name,
    };
  });
}

/**
 * Persist enriched metadata back to the database
 * This ensures consistency across all tabs and sessions
 */
async function persistMetadataToDatabase(
  positionId: string,
  tokenSymbol: string,
  tokenName: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('positions')
      .update({
        token_symbol: tokenSymbol,
        token_name: tokenName,
      })
      .eq('id', positionId);

    if (error) {
      console.warn(`[Reconciler] Failed to persist metadata for ${positionId}:`, error.message);
    } else {
      console.log(`[Reconciler] Persisted metadata for position ${positionId}: ${tokenSymbol}`);
    }
  } catch (err) {
    // Non-blocking - log and continue
    console.warn(`[Reconciler] Error persisting metadata:`, err);
  }
}

/**
 * Batch fetch and reconcile position metadata from DexScreener
 * Use this when pool data is not available
 * 
 * ENHANCED: Now persists enriched metadata back to database for consistency
 */
export async function fetchAndReconcilePositionMetadata<T extends PositionForReconcile>(
  positions: T[],
  options?: { persistToDb?: boolean }
): Promise<T[]> {
  const { persistToDb = true } = options || {};
  
  // Find positions that need metadata
  const needsMetadata = positions.filter(
    (p) => isPlaceholderTokenText(p.token_symbol) || isPlaceholderTokenText(p.token_name)
  );

  if (needsMetadata.length === 0) {
    return positions;
  }

  // Fetch metadata from DexScreener
  const addresses = [...new Set(needsMetadata.map((p) => p.token_address))];
  const metadataMap = await fetchDexScreenerTokenMetadata(addresses);

  if (metadataMap.size === 0) {
    return positions;
  }

  // Track which positions were updated for persistence
  const updatedPositions: { id: string; symbol: string; name: string }[] = [];

  // Update positions with fetched metadata
  const result = positions.map((position) => {
    const metadata = metadataMap.get(position.token_address);
    if (!metadata) {
      return position;
    }

    const needsSymbolUpdate = isPlaceholderTokenText(position.token_symbol);
    const needsNameUpdate = isPlaceholderTokenText(position.token_name);

    if (!needsSymbolUpdate && !needsNameUpdate) {
      return position;
    }

    const newSymbol = needsSymbolUpdate ? metadata.symbol : position.token_symbol;
    const newName = needsNameUpdate ? metadata.name : position.token_name;

    // Track for database persistence
    if (persistToDb && (needsSymbolUpdate || needsNameUpdate)) {
      updatedPositions.push({
        id: position.id,
        symbol: newSymbol || metadata.symbol,
        name: newName || metadata.name,
      });
    }

    return {
      ...position,
      token_symbol: newSymbol,
      token_name: newName,
    };
  });

  // Persist updates to database in background (non-blocking)
  if (persistToDb && updatedPositions.length > 0) {
    // Fire and forget - don't await to avoid blocking UI
    Promise.all(
      updatedPositions.map((p) => persistMetadataToDatabase(p.id, p.symbol, p.name))
    ).catch((err) => console.warn('[Reconciler] Batch persist error:', err));
  }

  return result;
}
