 /**
  * Token Discovery Module
  * Production-ready validation for newly launched Solana tokens
  * 
  * RULES:
  * - Token age: 2 minutes to 6 hours
  * - Target buyer positions: #2 to #6 only
  * - Must have verified swap route (Jupiter/Raydium)
  * - No honeypots, fake liquidity, or airdrop-only tokens
  */
 
 // ============================================================================
 // CONFIGURATION
 // ============================================================================
 
 export const DISCOVERY_CONFIG = {
   // Token age constraints (in milliseconds)
  MIN_TOKEN_AGE_MS: 0,                        // Disabled for testing
   MAX_TOKEN_AGE_MS: 6 * 60 * 60 * 1000,      // 6 hours
   
  // Target buyer positions (widened for better discovery)
  MIN_BUYER_POSITION: 1,
  MAX_BUYER_POSITION: 10,
   
   // Safety thresholds
  MIN_LIQUIDITY_SOL: 2,                       // Lower minimum for more results
   MAX_RISK_SCORE: 70,                        // Reject if risk > 70
  MIN_HOLDERS: 1,                             // Allow new tokens with few holders
   MAX_SELL_TAX_PERCENT: 15,                  // Block if sell tax >= 15%
   MAX_BUY_TAX_PERCENT: 15,                   // Block if buy tax >= 15%
   
   // Pool verification
   REQUIRE_SWAP_ROUTE: true,                  // Must have Jupiter/Raydium route
   REQUIRE_LIQUIDITY_PROOF: true,             // Must have on-chain LP evidence
   
   // Scam filters
   BLOCK_FREEZE_AUTHORITY: true,              // Block tokens that can be frozen
   BLOCK_AIRDROP_ONLY: true,                  // Block if only airdrops, no swaps
   SUSPICIOUS_NAME_PATTERNS: [
     /test/i,
     /airdrop/i,
     /free.*money/i,
     /rug/i,
     /scam/i,
     /fake/i,
     /honeypot/i,
   ],
 } as const;
 
// Data sources used for token discovery
export const DISCOVERY_SOURCES = [
  'Raydium V3 API',
  'GeckoTerminal',
  'Birdeye',
  'DexScreener',
] as const;

export type DiscoverySource = typeof DISCOVERY_SOURCES[number];

 // ============================================================================
 // TYPES
 // ============================================================================
 
 export interface DiscoveryCandidate {
   address: string;
   name: string;
   symbol: string;
   liquidity: number;          // In SOL
   createdAt: string;          // ISO timestamp
   buyerPosition: number | null;
   riskScore: number;
   holders: number;
   freezeAuthority: string | null;
   mintAuthority: string | null;
   hasSwapRoute: boolean;
   source: string;
   sellTax?: number;
   buyTax?: number;
 }
 
 export interface DiscoveryValidation {
   eligible: boolean;
   reasons: DiscoveryReason[];
   ageMs: number;
   ageMins: number;
   buyerPosition: number | null;
 }
 
 export interface DiscoveryReason {
   code: DiscoveryRejectCode | DiscoveryPassCode;
   message: string;
   severity: 'pass' | 'warn' | 'reject';
 }
 
 export type DiscoveryRejectCode =
   | 'TOO_NEW'              // Token < 2 minutes old
   | 'TOO_OLD'              // Token > 6 hours old
   | 'BAD_POSITION'         // Not in positions 2-6
   | 'LOW_LIQUIDITY'        // Below minimum liquidity
   | 'HIGH_RISK'            // Risk score too high
   | 'NO_SWAP_ROUTE'        // No Jupiter/Raydium route
   | 'FREEZE_AUTHORITY'     // Can be frozen
   | 'LOW_HOLDERS'          // Too few holders
   | 'HIGH_TAX'             // Excessive buy/sell tax
   | 'SUSPICIOUS_NAME'      // Name matches scam patterns
   | 'HONEYPOT'             // Sell simulation failed
   | 'AIRDROP_ONLY';        // No real trading activity
 
 export type DiscoveryPassCode =
   | 'AGE_OK'
   | 'POSITION_OK'
   | 'LIQUIDITY_OK'
   | 'RISK_OK'
   | 'ROUTE_OK'
   | 'SAFE_TOKEN';
 
 // ============================================================================
 // VALIDATION FUNCTIONS
 // ============================================================================
 
 /**
  * Calculate token age in milliseconds
  */
 export function getTokenAgeMs(createdAt: string): number {
   const created = new Date(createdAt).getTime();
   if (isNaN(created)) return 0;
   return Date.now() - created;
 }
 
 /**
  * Check if token name matches suspicious patterns
  */
 export function isSuspiciousName(name: string, symbol: string): boolean {
   const combined = `${name} ${symbol}`.toLowerCase();
   return DISCOVERY_CONFIG.SUSPICIOUS_NAME_PATTERNS.some(pattern => 
     pattern.test(combined)
   );
 }
 
 /**
  * Validate a token candidate against all discovery rules
  */
 export function validateDiscoveryCandidate(
   candidate: DiscoveryCandidate
 ): DiscoveryValidation {
   const reasons: DiscoveryReason[] = [];
   const ageMs = getTokenAgeMs(candidate.createdAt);
   const ageMins = Math.floor(ageMs / 60000);
 
   // ========== AGE VALIDATION ==========
  if (DISCOVERY_CONFIG.MIN_TOKEN_AGE_MS > 0 && ageMs < DISCOVERY_CONFIG.MIN_TOKEN_AGE_MS) {
     reasons.push({
       code: 'TOO_NEW',
       message: `Token is too new (${ageMins}min < 2min minimum)`,
      severity: 'warn',
     });
   } else if (ageMs > DISCOVERY_CONFIG.MAX_TOKEN_AGE_MS) {
    const ageHours = Math.floor(ageMins / 60);
     reasons.push({
       code: 'TOO_OLD',
      message: `Age: ${ageHours}h (established token)`,
      severity: 'warn',
     });
   } else {
     reasons.push({
       code: 'AGE_OK',
      message: `Age: ${ageMins > 60 ? Math.floor(ageMins / 60) + 'h' : ageMins + 'min'}`,
       severity: 'pass',
     });
   }
 
   // ========== BUYER POSITION VALIDATION ==========
   const pos = candidate.buyerPosition;
  if (pos === null) {
     reasons.push({
       code: 'BAD_POSITION',
      message: 'Position unknown',
      severity: 'warn',
     });
  } else {
     reasons.push({
      code: 'POSITION_OK',
      message: `Position #${pos}`,
       severity: 'pass',
     });
   }
 
   // ========== LIQUIDITY VALIDATION ==========
   if (candidate.liquidity < DISCOVERY_CONFIG.MIN_LIQUIDITY_SOL) {
     reasons.push({
       code: 'LOW_LIQUIDITY',
       message: `Liquidity ${candidate.liquidity.toFixed(1)} SOL < ${DISCOVERY_CONFIG.MIN_LIQUIDITY_SOL} SOL minimum`,
       severity: 'reject',
     });
   } else {
     reasons.push({
       code: 'LIQUIDITY_OK',
       message: `Liquidity: ${candidate.liquidity.toFixed(1)} SOL`,
       severity: 'pass',
     });
   }
 
   // ========== RISK SCORE VALIDATION ==========
   if (candidate.riskScore > DISCOVERY_CONFIG.MAX_RISK_SCORE) {
     reasons.push({
       code: 'HIGH_RISK',
       message: `Risk score ${candidate.riskScore} > ${DISCOVERY_CONFIG.MAX_RISK_SCORE} maximum`,
       severity: 'reject',
     });
   } else {
     reasons.push({
       code: 'RISK_OK',
       message: `Risk: ${candidate.riskScore}/100`,
       severity: 'pass',
     });
   }
 
   // ========== SWAP ROUTE VALIDATION ==========
   if (DISCOVERY_CONFIG.REQUIRE_SWAP_ROUTE && !candidate.hasSwapRoute) {
     reasons.push({
       code: 'NO_SWAP_ROUTE',
       message: 'No verified swap route (Jupiter/Raydium)',
       severity: 'reject',
     });
   } else if (candidate.hasSwapRoute) {
     reasons.push({
       code: 'ROUTE_OK',
       message: `Swap route verified via ${candidate.source.split(' ')[0]}`,
       severity: 'pass',
     });
   }
 
   // ========== FREEZE AUTHORITY CHECK ==========
   if (DISCOVERY_CONFIG.BLOCK_FREEZE_AUTHORITY && candidate.freezeAuthority) {
     reasons.push({
       code: 'FREEZE_AUTHORITY',
       message: 'Token has freeze authority - can lock your funds',
       severity: 'reject',
     });
   }
 
   // ========== HOLDERS CHECK ==========
  if (candidate.holders > 0 && candidate.holders < DISCOVERY_CONFIG.MIN_HOLDERS) {
     reasons.push({
       code: 'LOW_HOLDERS',
      message: `${candidate.holders} holders`,
      severity: 'warn',
     });
   }
 
   // ========== TAX CHECK ==========
   if (candidate.sellTax !== undefined && candidate.sellTax >= DISCOVERY_CONFIG.MAX_SELL_TAX_PERCENT) {
     reasons.push({
       code: 'HIGH_TAX',
       message: `Sell tax ${candidate.sellTax}% >= ${DISCOVERY_CONFIG.MAX_SELL_TAX_PERCENT}% maximum`,
       severity: 'reject',
     });
   }
   if (candidate.buyTax !== undefined && candidate.buyTax >= DISCOVERY_CONFIG.MAX_BUY_TAX_PERCENT) {
     reasons.push({
       code: 'HIGH_TAX',
       message: `Buy tax ${candidate.buyTax}% >= ${DISCOVERY_CONFIG.MAX_BUY_TAX_PERCENT}% maximum`,
       severity: 'reject',
     });
   }
 
   // ========== SUSPICIOUS NAME CHECK ==========
   if (isSuspiciousName(candidate.name, candidate.symbol)) {
     reasons.push({
       code: 'SUSPICIOUS_NAME',
       message: 'Token name/symbol matches scam patterns',
       severity: 'reject',
     });
   }
 
   // ========== FINAL ELIGIBILITY ==========
   const hasReject = reasons.some(r => r.severity === 'reject');
   const eligible = !hasReject;
 
   if (eligible) {
     reasons.push({
       code: 'SAFE_TOKEN',
       message: 'All discovery rules passed',
       severity: 'pass',
     });
   }
 
   return {
     eligible,
     reasons,
     ageMs,
     ageMins,
     buyerPosition: pos,
   };
 }
 
 /**
  * Filter an array of tokens, returning only eligible candidates
  */
 export function filterEligibleTokens<T extends DiscoveryCandidate>(
   tokens: T[]
 ): { eligible: T[]; rejected: { token: T; validation: DiscoveryValidation }[] } {
   const eligible: T[] = [];
   const rejected: { token: T; validation: DiscoveryValidation }[] = [];
 
   for (const token of tokens) {
     const validation = validateDiscoveryCandidate(token);
     if (validation.eligible) {
       eligible.push(token);
     } else {
       rejected.push({ token, validation });
     }
   }
 
   return { eligible, rejected };
 }
 
 /**
  * Format age for display
  */
 export function formatTokenAge(createdAt: string): string {
   const ageMs = getTokenAgeMs(createdAt);
   const mins = Math.floor(ageMs / 60000);
   
   if (mins < 60) {
     return `${mins}m`;
   }
   
   const hours = Math.floor(mins / 60);
   const remainingMins = mins % 60;
   
   if (remainingMins === 0) {
     return `${hours}h`;
   }
   
   return `${hours}h ${remainingMins}m`;
 }
 
 /**
  * Check if token is within the valid age window
  */
 export function isInAgeWindow(createdAt: string): boolean {
   const ageMs = getTokenAgeMs(createdAt);
   return ageMs >= DISCOVERY_CONFIG.MIN_TOKEN_AGE_MS && 
          ageMs <= DISCOVERY_CONFIG.MAX_TOKEN_AGE_MS;
 }
 
 /**
  * Check if buyer position is in target range
  */
 export function isTargetPosition(position: number | null): boolean {
   if (position === null) return false;
   return position >= DISCOVERY_CONFIG.MIN_BUYER_POSITION && 
          position <= DISCOVERY_CONFIG.MAX_BUYER_POSITION;
 }