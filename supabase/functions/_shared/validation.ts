/**
 * Shared validation schemas and utilities for edge functions
 * Using manual validation instead of zod to avoid npm dependencies in Deno edge functions
 */

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Helper to create error result
function errorResult<T>(error: string): ValidationResult<T> {
  return { success: false, error };
}

// Helper to validate string
export function validateString(value: unknown, fieldName: string, minLength = 0, maxLength = 1000): ValidationResult<string> {
  if (typeof value !== 'string') {
    return errorResult(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    return errorResult(`${fieldName} must be at least ${minLength} characters`);
  }
  if (trimmed.length > maxLength) {
    return errorResult(`${fieldName} must be at most ${maxLength} characters`);
  }
  return { success: true, data: trimmed };
}

// Helper to validate number
export function validateNumber(value: unknown, fieldName: string, min?: number, max?: number): ValidationResult<number> {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) {
    return errorResult(`${fieldName} must be a valid number`);
  }
  if (min !== undefined && num < min) {
    return errorResult(`${fieldName} must be at least ${min}`);
  }
  if (max !== undefined && num > max) {
    return errorResult(`${fieldName} must be at most ${max}`);
  }
  return { success: true, data: num };
}

// Helper to validate boolean
export function validateBoolean(value: unknown, fieldName: string): ValidationResult<boolean> {
  if (typeof value !== 'boolean') {
    return errorResult(`${fieldName} must be a boolean`);
  }
  return { success: true, data: value };
}

// Helper to validate array with max length
export function validateArray<T>(
  value: unknown, 
  fieldName: string, 
  maxLength = 100,
  itemValidator?: (item: unknown, index: number) => ValidationResult<T>
): ValidationResult<T[]> {
  if (!Array.isArray(value)) {
    return errorResult(`${fieldName} must be an array`);
  }
  if (value.length > maxLength) {
    return errorResult(`${fieldName} must have at most ${maxLength} items`);
  }
  if (itemValidator) {
    const validatedItems: T[] = [];
    for (let i = 0; i < value.length; i++) {
      const result = itemValidator(value[i], i);
      if (!result.success) {
        return errorResult(`${fieldName}[${i}]: ${result.error}`);
      }
      validatedItems.push(result.data!);
    }
    return { success: true, data: validatedItems };
  }
  return { success: true, data: value as T[] };
}

// Helper to validate enum values
export function validateEnum<T extends string>(value: unknown, fieldName: string, allowedValues: T[]): ValidationResult<T> {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    return errorResult(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
  return { success: true, data: value as T };
}

// Helper to validate UUID format
export function validateUUID(value: unknown, fieldName: string): ValidationResult<string> {
  if (typeof value !== 'string') {
    return errorResult(`${fieldName} must be a string`);
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    return errorResult(`${fieldName} must be a valid UUID`);
  }
  return { success: true, data: value };
}

// Helper to validate wallet/token address format (basic check)
export function validateAddress(value: unknown, fieldName: string): ValidationResult<string> {
  if (typeof value !== 'string') {
    return errorResult(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  // Basic validation: alphanumeric, between 26-66 characters (covers Solana, EVM addresses)
  if (trimmed.length < 26 || trimmed.length > 66) {
    return errorResult(`${fieldName} must be a valid blockchain address (26-66 characters)`);
  }
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return errorResult(`${fieldName} must contain only alphanumeric characters`);
  }
  return { success: true, data: trimmed };
}

// =============== Token Scanner Validation ===============
export interface TokenScannerInput {
  minLiquidity: number;
  chains: string[];
}

const ALLOWED_CHAINS = ['solana', 'ethereum', 'bsc', 'eth', 'base', 'arbitrum', 'polygon'];

export function validateTokenScannerInput(body: unknown): ValidationResult<TokenScannerInput> {
  if (typeof body !== 'object' || body === null) {
    return { success: true, data: { minLiquidity: 300, chains: ['solana'] } };
  }
  
  const obj = body as Record<string, unknown>;
  
  // Validate minLiquidity with defaults
  let minLiquidity = 300;
  if (obj.minLiquidity !== undefined) {
    const result = validateNumber(obj.minLiquidity, 'minLiquidity', 0, 1000000);
    if (!result.success) return errorResult(result.error!);
    minLiquidity = result.data!;
  }
  
  // Validate chains with defaults
  let chains: string[] = ['solana'];
  if (obj.chains !== undefined) {
    if (!Array.isArray(obj.chains)) {
      return errorResult('chains must be an array');
    }
    if (obj.chains.length > 10) {
      return errorResult('chains must have at most 10 items');
    }
    const validChains: string[] = [];
    for (const chain of obj.chains) {
      if (typeof chain !== 'string' || !ALLOWED_CHAINS.includes(chain)) {
        return errorResult(`Invalid chain: ${chain}. Must be one of: ${ALLOWED_CHAINS.join(', ')}`);
      }
      validChains.push(chain);
    }
    chains = validChains;
  }
  
  return { success: true, data: { minLiquidity, chains } };
}

// =============== Auto-Sniper Validation ===============
export interface TokenData {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  liquidity: number;
  liquidityLocked: boolean;
  lockPercentage: number | null;
  buyerPosition: number | null;
  riskScore: number;
  categories: string[];
  priceUsd?: number;
}

export interface AutoSniperInput {
  tokens: TokenData[];
  executeOnApproval: boolean;
}

function validateTokenData(item: unknown, index: number): ValidationResult<TokenData> {
  if (typeof item !== 'object' || item === null) {
    return errorResult(`Token at index ${index} must be an object`);
  }
  
  const obj = item as Record<string, unknown>;
  
  // Required fields - address
  const addressResult = validateAddress(obj.address, 'address');
  if (!addressResult.success) return errorResult(addressResult.error!);
  
  // Optional string fields with safe defaults
  const name = typeof obj.name === 'string' ? obj.name.slice(0, 100) : '';
  const symbol = typeof obj.symbol === 'string' ? obj.symbol.slice(0, 20) : '';
  const chain = typeof obj.chain === 'string' ? obj.chain.slice(0, 50) : 'solana';
  
  // Numeric fields
  const liquidity = typeof obj.liquidity === 'number' && obj.liquidity >= 0 ? obj.liquidity : 0;
  const riskScore = typeof obj.riskScore === 'number' ? Math.min(100, Math.max(0, obj.riskScore)) : 50;
  
  return {
    success: true,
    data: {
      address: addressResult.data!,
      name,
      symbol,
      chain,
      liquidity,
      liquidityLocked: typeof obj.liquidityLocked === 'boolean' ? obj.liquidityLocked : false,
      lockPercentage: typeof obj.lockPercentage === 'number' ? obj.lockPercentage : null,
      buyerPosition: typeof obj.buyerPosition === 'number' ? obj.buyerPosition : null,
      riskScore,
      categories: Array.isArray(obj.categories) ? obj.categories.filter(c => typeof c === 'string').slice(0, 20) : [],
      priceUsd: typeof obj.priceUsd === 'number' ? obj.priceUsd : undefined,
    }
  };
}

export function validateAutoSniperInput(body: unknown): ValidationResult<AutoSniperInput> {
  if (typeof body !== 'object' || body === null) {
    return { success: true, data: { tokens: [], executeOnApproval: false } };
  }
  
  const obj = body as Record<string, unknown>;
  
  // Validate tokens array (max 100 tokens per request)
  let tokens: TokenData[] = [];
  if (obj.tokens !== undefined) {
    if (!Array.isArray(obj.tokens)) {
      return errorResult('tokens must be an array');
    }
    if (obj.tokens.length > 100) {
      return errorResult('tokens must have at most 100 items');
    }
    for (let i = 0; i < obj.tokens.length; i++) {
      const result = validateTokenData(obj.tokens[i], i);
      if (!result.success) return errorResult(result.error!);
      tokens.push(result.data!);
    }
  }
  
  // Validate executeOnApproval
  const executeOnApproval = typeof obj.executeOnApproval === 'boolean' ? obj.executeOnApproval : false;
  
  return { success: true, data: { tokens, executeOnApproval } };
}

// =============== Auto-Exit Validation ===============
export interface AutoExitInput {
  positionIds: string[] | undefined;
  executeExits: boolean;
}

export function validateAutoExitInput(body: unknown): ValidationResult<AutoExitInput> {
  if (typeof body !== 'object' || body === null) {
    return { success: true, data: { positionIds: undefined, executeExits: false } };
  }
  
  const obj = body as Record<string, unknown>;
  
  // Validate positionIds (optional array of UUIDs, max 50)
  let positionIds: string[] | undefined = undefined;
  if (obj.positionIds !== undefined) {
    if (!Array.isArray(obj.positionIds)) {
      return errorResult('positionIds must be an array');
    }
    if (obj.positionIds.length > 50) {
      return errorResult('positionIds must have at most 50 items');
    }
    const validIds: string[] = [];
    for (let i = 0; i < obj.positionIds.length; i++) {
      const result = validateUUID(obj.positionIds[i], `positionIds[${i}]`);
      if (!result.success) return errorResult(result.error!);
      validIds.push(result.data!);
    }
    positionIds = validIds;
  }
  
  // Validate executeExits
  const executeExits = typeof obj.executeExits === 'boolean' ? obj.executeExits : false;
  
  return { success: true, data: { positionIds, executeExits } };
}

// =============== Risk Check Validation ===============
export type RiskCheckAction = 'get_settings' | 'update_settings' | 'emergency_stop' | 'reset_circuit_breaker' | 'check_tokens' | 'get_logs';

export interface RiskCheckToken {
  address: string;
  symbol?: string;
  chain?: string;
}

export interface RiskCheckInput {
  action: RiskCheckAction;
  tokens?: RiskCheckToken[];
  updates?: Record<string, unknown>;
  active?: boolean;
  limit?: number;
}

const RISK_CHECK_ACTIONS: RiskCheckAction[] = ['get_settings', 'update_settings', 'emergency_stop', 'reset_circuit_breaker', 'check_tokens', 'get_logs'];

export function validateRiskCheckInput(body: unknown): ValidationResult<RiskCheckInput> {
  if (typeof body !== 'object' || body === null) {
    return errorResult('Request body is required');
  }
  
  const obj = body as Record<string, unknown>;
  
  // Validate action (required)
  if (typeof obj.action !== 'string' || !RISK_CHECK_ACTIONS.includes(obj.action as RiskCheckAction)) {
    return errorResult(`action must be one of: ${RISK_CHECK_ACTIONS.join(', ')}`);
  }
  
  const action = obj.action as RiskCheckAction;
  const result: RiskCheckInput = { action };
  
  // Validate action-specific fields
  if (action === 'check_tokens') {
    if (obj.tokens !== undefined) {
      if (!Array.isArray(obj.tokens)) {
        return errorResult('tokens must be an array');
      }
      if (obj.tokens.length > 50) {
        return errorResult('tokens must have at most 50 items');
      }
      const validTokens: RiskCheckToken[] = [];
      for (let i = 0; i < obj.tokens.length; i++) {
        const item = obj.tokens[i];
        if (typeof item !== 'object' || item === null) {
          return errorResult(`tokens[${i}] must be an object`);
        }
        const tokenObj = item as Record<string, unknown>;
        const addressResult = validateAddress(tokenObj.address, `tokens[${i}].address`);
        if (!addressResult.success) return errorResult(addressResult.error!);
        validTokens.push({
          address: addressResult.data!,
          symbol: typeof tokenObj.symbol === 'string' ? tokenObj.symbol.slice(0, 20) : undefined,
          chain: typeof tokenObj.chain === 'string' ? tokenObj.chain.slice(0, 50) : undefined,
        });
      }
      result.tokens = validTokens;
    }
  }
  
  if (action === 'update_settings' && obj.updates !== undefined) {
    if (typeof obj.updates !== 'object' || obj.updates === null) {
      return errorResult('updates must be an object');
    }
    result.updates = obj.updates as Record<string, unknown>;
  }
  
  if (action === 'emergency_stop') {
    if (typeof obj.active !== 'boolean') {
      return errorResult('active must be a boolean');
    }
    result.active = obj.active;
  }
  
  if (action === 'get_logs') {
    if (obj.limit !== undefined) {
      const limitResult = validateNumber(obj.limit, 'limit', 1, 200);
      if (!limitResult.success) return errorResult(limitResult.error!);
      result.limit = limitResult.data!;
    }
  }
  
  return { success: true, data: result };
}

// =============== Admin Analytics Validation ===============
export type AdminAction = 'get_analytics' | 'log_event' | 'log_api_health';
export type TimeRange = '1h' | '24h' | '7d' | '30d';

export interface AdminAnalyticsInput {
  action: AdminAction;
  timeRange: TimeRange;
  // For log_event
  eventType?: string;
  eventCategory?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  severity?: string;
  // For log_api_health
  apiType?: string;
  endpoint?: string;
  responseTimeMs?: number;
  statusCode?: number;
  isSuccess?: boolean;
  errorMessage?: string;
}

const ADMIN_ACTIONS: AdminAction[] = ['get_analytics', 'log_event', 'log_api_health'];
const TIME_RANGES: TimeRange[] = ['1h', '24h', '7d', '30d'];
const SEVERITY_LEVELS = ['info', 'warning', 'error', 'debug'];

export function validateAdminAnalyticsInput(body: unknown): ValidationResult<AdminAnalyticsInput> {
  if (typeof body !== 'object' || body === null) {
    return { success: true, data: { action: 'get_analytics', timeRange: '24h' } };
  }
  
  const obj = body as Record<string, unknown>;
  
  // Validate action
  let action: AdminAction = 'get_analytics';
  if (obj.action !== undefined) {
    if (typeof obj.action !== 'string' || !ADMIN_ACTIONS.includes(obj.action as AdminAction)) {
      return errorResult(`action must be one of: ${ADMIN_ACTIONS.join(', ')}`);
    }
    action = obj.action as AdminAction;
  }
  
  // Validate timeRange
  let timeRange: TimeRange = '24h';
  if (obj.timeRange !== undefined) {
    if (typeof obj.timeRange !== 'string' || !TIME_RANGES.includes(obj.timeRange as TimeRange)) {
      return errorResult(`timeRange must be one of: ${TIME_RANGES.join(', ')}`);
    }
    timeRange = obj.timeRange as TimeRange;
  }
  
  const result: AdminAnalyticsInput = { action, timeRange };
  
  // Validate log_event fields
  if (action === 'log_event') {
    if (obj.eventType !== undefined) {
      if (typeof obj.eventType !== 'string' || obj.eventType.length < 1 || obj.eventType.length > 100) {
        return errorResult('eventType must be a string between 1-100 characters');
      }
      result.eventType = obj.eventType;
    }
    if (obj.eventCategory !== undefined) {
      if (typeof obj.eventCategory !== 'string' || obj.eventCategory.length < 1 || obj.eventCategory.length > 100) {
        return errorResult('eventCategory must be a string between 1-100 characters');
      }
      result.eventCategory = obj.eventCategory;
    }
    if (obj.message !== undefined) {
      if (typeof obj.message !== 'string' || obj.message.length > 1000) {
        return errorResult('message must be a string with at most 1000 characters');
      }
      result.message = obj.message;
    }
    if (obj.metadata !== undefined && typeof obj.metadata === 'object') {
      result.metadata = obj.metadata as Record<string, unknown>;
    }
    if (obj.severity !== undefined) {
      if (typeof obj.severity !== 'string' || !SEVERITY_LEVELS.includes(obj.severity)) {
        return errorResult(`severity must be one of: ${SEVERITY_LEVELS.join(', ')}`);
      }
      result.severity = obj.severity;
    }
  }
  
  // Validate log_api_health fields
  if (action === 'log_api_health') {
    if (obj.apiType !== undefined) {
      if (typeof obj.apiType !== 'string' || obj.apiType.length < 1 || obj.apiType.length > 100) {
        return errorResult('apiType must be a string between 1-100 characters');
      }
      result.apiType = obj.apiType;
    }
    if (obj.endpoint !== undefined) {
      if (typeof obj.endpoint !== 'string' || obj.endpoint.length > 500) {
        return errorResult('endpoint must be a string with at most 500 characters');
      }
      result.endpoint = obj.endpoint;
    }
    if (obj.responseTimeMs !== undefined) {
      const r = validateNumber(obj.responseTimeMs, 'responseTimeMs', 0, 60000);
      if (!r.success) return errorResult(r.error!);
      result.responseTimeMs = r.data!;
    }
    if (obj.statusCode !== undefined) {
      const r = validateNumber(obj.statusCode, 'statusCode', 0, 599);
      if (!r.success) return errorResult(r.error!);
      result.statusCode = r.data!;
    }
    if (obj.isSuccess !== undefined) {
      if (typeof obj.isSuccess !== 'boolean') {
        return errorResult('isSuccess must be a boolean');
      }
      result.isSuccess = obj.isSuccess;
    }
    if (obj.errorMessage !== undefined) {
      if (typeof obj.errorMessage !== 'string' || obj.errorMessage.length > 1000) {
        return errorResult('errorMessage must be a string with at most 1000 characters');
      }
      result.errorMessage = obj.errorMessage;
    }
  }
  
  return { success: true, data: result };
}
