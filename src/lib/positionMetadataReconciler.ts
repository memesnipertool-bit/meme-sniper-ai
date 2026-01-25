/**
 * Position Metadata Reconciler
 * 
 * Reconciles token names and symbols between active positions and scanner pools.
 * This ensures that "Active Trades" display the correct token names from the pools
 * that triggered the trades.
 */

import { isPlaceholderTokenText, fetchDexScreenerTokenMetadata } from './dexscreener';

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
 * Batch fetch and reconcile position metadata from DexScreener
 * Use this when pool data is not available
 */
export async function fetchAndReconcilePositionMetadata<T extends PositionForReconcile>(
  positions: T[]
): Promise<T[]> {
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

  // Update positions with fetched metadata
  return positions.map((position) => {
    const metadata = metadataMap.get(position.token_address);
    if (!metadata) {
      return position;
    }

    const needsSymbolUpdate = isPlaceholderTokenText(position.token_symbol);
    const needsNameUpdate = isPlaceholderTokenText(position.token_name);

    if (!needsSymbolUpdate && !needsNameUpdate) {
      return position;
    }

    return {
      ...position,
      token_symbol: needsSymbolUpdate ? metadata.symbol : position.token_symbol,
      token_name: needsNameUpdate ? metadata.name : position.token_name,
    };
  });
}
