import { z } from 'zod';

// Solana address validation regex (base58, 32-44 chars)
const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Zod schema for sniper settings validation
 */
export const sniperSettingsSchema = z.object({
  min_liquidity: z
    .number()
    .min(50, 'Minimum liquidity must be at least 50 SOL')
    .max(10000, 'Minimum liquidity cannot exceed 10,000 SOL'),
  
  profit_take_percentage: z
    .number()
    .min(10, 'Take profit must be at least 10%')
    .max(1000, 'Take profit cannot exceed 1000%'),
  
  stop_loss_percentage: z
    .number()
    .min(5, 'Stop loss must be at least 5%')
    .max(90, 'Stop loss cannot exceed 90%'),
  
  trade_amount: z
    .number()
    .min(0.01, 'Trade amount must be at least 0.01 SOL')
    .max(100, 'Trade amount cannot exceed 100 SOL'),
  
  max_concurrent_trades: z
    .number()
    .int('Must be a whole number')
    .min(1, 'Must allow at least 1 concurrent trade')
    .max(20, 'Cannot exceed 20 concurrent trades'),
  
  priority: z.enum(['normal', 'fast', 'turbo']),
  
  category_filters: z
    .array(z.string())
    .min(1, 'Select at least one category'),
  
  token_blacklist: z
    .array(z.string().regex(solanaAddressRegex, 'Invalid token address format')),
  
  token_whitelist: z
    .array(z.string().regex(solanaAddressRegex, 'Invalid token address format')),
});

export type ValidatedSniperSettings = z.infer<typeof sniperSettingsSchema>;

/**
 * Validate a single field
 */
export function validateField<K extends keyof ValidatedSniperSettings>(
  field: K,
  value: ValidatedSniperSettings[K]
): { valid: boolean; error?: string } {
  try {
    const fieldSchema = sniperSettingsSchema.shape[field];
    fieldSchema.parse(value);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.errors[0]?.message };
    }
    return { valid: false, error: 'Invalid value' };
  }
}

/**
 * Validate entire settings object
 */
export function validateSettings(settings: unknown): {
  valid: boolean;
  errors: Record<string, string>;
  data?: ValidatedSniperSettings;
} {
  try {
    const data = sniperSettingsSchema.parse(settings);
    return { valid: true, errors: {}, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { valid: false, errors };
    }
    return { valid: false, errors: { _form: 'Validation failed' } };
  }
}

/**
 * Validate a Solana token address
 */
export function isValidSolanaAddress(address: string): boolean {
  return solanaAddressRegex.test(address.trim());
}
