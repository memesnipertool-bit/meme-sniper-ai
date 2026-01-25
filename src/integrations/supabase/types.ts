export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      api_configurations: {
        Row: {
          api_key_encrypted: string | null
          api_name: string
          api_type: string
          base_url: string
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean | null
          last_checked_at: string | null
          rate_limit_per_minute: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_name: string
          api_type: string
          base_url: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean | null
          last_checked_at?: string | null
          rate_limit_per_minute?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_name?: string
          api_type?: string
          base_url?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean | null
          last_checked_at?: string | null
          rate_limit_per_minute?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_health_metrics: {
        Row: {
          api_type: string
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          is_success: boolean | null
          response_time_ms: number | null
          status_code: number | null
        }
        Insert: {
          api_type: string
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          is_success?: boolean | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          api_type?: string
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          is_success?: boolean | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      copy_trades: {
        Row: {
          action: string
          amount: number
          created_at: string
          id: string
          leader_address: string
          leader_name: string | null
          price: number
          status: string | null
          token_address: string
          token_symbol: string
          tx_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          amount: number
          created_at?: string
          id?: string
          leader_address: string
          leader_name?: string | null
          price: number
          status?: string | null
          token_address: string
          token_symbol: string
          tx_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          created_at?: string
          id?: string
          leader_address?: string
          leader_name?: string | null
          price?: number
          status?: string | null
          token_address?: string
          token_symbol?: string
          tx_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      disclaimer_acknowledgments: {
        Row: {
          acknowledged_at: string
          id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          amount: number
          chain: string | null
          closed_at: string | null
          created_at: string
          current_price: number | null
          current_value: number | null
          entry_price: number
          entry_price_usd: number | null
          entry_value: number | null
          exit_price: number | null
          exit_reason: string | null
          exit_tx_id: string | null
          id: string
          pnl_percentage: number | null
          profit_loss_percent: number | null
          profit_loss_value: number | null
          profit_take_percent: number | null
          status: string | null
          stop_loss_percent: number | null
          token_address: string
          token_name: string | null
          token_symbol: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          chain?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          entry_price: number
          entry_price_usd?: number | null
          entry_value?: number | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_tx_id?: string | null
          id?: string
          pnl_percentage?: number | null
          profit_loss_percent?: number | null
          profit_loss_value?: number | null
          profit_take_percent?: number | null
          status?: string | null
          stop_loss_percent?: number | null
          token_address: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          chain?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          entry_price?: number
          entry_price_usd?: number | null
          entry_value?: number | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_tx_id?: string | null
          id?: string
          pnl_percentage?: number | null
          profit_loss_percent?: number | null
          profit_loss_value?: number | null
          profit_take_percent?: number | null
          status?: string | null
          stop_loss_percent?: number | null
          token_address?: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_suspended: boolean | null
          suspended_at: string | null
          suspension_reason: string | null
          two_factor_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_suspended?: boolean | null
          suspended_at?: string | null
          suspension_reason?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_suspended?: boolean | null
          suspended_at?: string | null
          suspension_reason?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sniper_settings: {
        Row: {
          auto_buy_enabled: boolean | null
          created_at: string
          gas_priority: string | null
          id: string
          max_buy_amount: number | null
          slippage_tolerance: number | null
          stop_loss_enabled: boolean | null
          stop_loss_percentage: number | null
          take_profit_enabled: boolean | null
          take_profit_percentage: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_buy_enabled?: boolean | null
          created_at?: string
          gas_priority?: string | null
          id?: string
          max_buy_amount?: number | null
          slippage_tolerance?: number | null
          stop_loss_enabled?: boolean | null
          stop_loss_percentage?: number | null
          take_profit_enabled?: boolean | null
          take_profit_percentage?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_buy_enabled?: boolean | null
          created_at?: string
          gas_priority?: string | null
          id?: string
          max_buy_amount?: number | null
          slippage_tolerance?: number | null
          stop_loss_enabled?: boolean | null
          stop_loss_percentage?: number | null
          take_profit_enabled?: boolean | null
          take_profit_percentage?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string
          event_category: string
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          severity: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_category: string
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_category?: string
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          amount: number
          created_at: string
          id: string
          price_sol: number | null
          price_usd: number | null
          status: string | null
          token_address: string
          token_name: string | null
          token_symbol: string | null
          trade_type: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          price_sol?: number | null
          price_usd?: number | null
          status?: string | null
          token_address: string
          token_name?: string | null
          token_symbol?: string | null
          trade_type: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          price_sol?: number | null
          price_usd?: number | null
          status?: string | null
          token_address?: string
          token_name?: string | null
          token_symbol?: string | null
          trade_type?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trade_signals: {
        Row: {
          chain: string | null
          created_at: string
          executed_at: string | null
          expires_at: string
          id: string
          is_pump_fun: boolean | null
          liquidity: number | null
          metadata: Json | null
          price_usd: number | null
          priority: string | null
          reasons: Json | null
          risk_score: number | null
          slippage: number | null
          source: string | null
          status: string | null
          token_address: string
          token_name: string
          token_symbol: string
          trade_amount: number
          tx_signature: string | null
          user_id: string
        }
        Insert: {
          chain?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at: string
          id?: string
          is_pump_fun?: boolean | null
          liquidity?: number | null
          metadata?: Json | null
          price_usd?: number | null
          priority?: string | null
          reasons?: Json | null
          risk_score?: number | null
          slippage?: number | null
          source?: string | null
          status?: string | null
          token_address: string
          token_name: string
          token_symbol: string
          trade_amount: number
          tx_signature?: string | null
          user_id: string
        }
        Update: {
          chain?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string
          is_pump_fun?: boolean | null
          liquidity?: number | null
          metadata?: Json | null
          price_usd?: number | null
          priority?: string | null
          reasons?: Json | null
          risk_score?: number | null
          slippage?: number | null
          source?: string | null
          status?: string | null
          token_address?: string
          token_name?: string
          token_symbol?: string
          trade_amount?: number
          tx_signature?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          activity_category: string
          activity_type: string
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_category: string
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_category?: string
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sniper_settings: {
        Row: {
          category_filters: Json | null
          created_at: string
          id: string
          max_concurrent_trades: number | null
          max_risk_score: number | null
          min_liquidity: number | null
          priority: string | null
          profit_take_percentage: number | null
          slippage_tolerance: number | null
          stop_loss_percentage: number | null
          target_buyer_positions: Json | null
          token_blacklist: Json | null
          token_whitelist: Json | null
          trade_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_filters?: Json | null
          created_at?: string
          id?: string
          max_concurrent_trades?: number | null
          max_risk_score?: number | null
          min_liquidity?: number | null
          priority?: string | null
          profit_take_percentage?: number | null
          slippage_tolerance?: number | null
          stop_loss_percentage?: number | null
          target_buyer_positions?: Json | null
          token_blacklist?: Json | null
          token_whitelist?: Json | null
          trade_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_filters?: Json | null
          created_at?: string
          id?: string
          max_concurrent_trades?: number | null
          max_risk_score?: number | null
          min_liquidity?: number | null
          priority?: string | null
          profit_take_percentage?: number | null
          slippage_tolerance?: number | null
          stop_loss_percentage?: number | null
          target_buyer_positions?: Json | null
          token_blacklist?: Json | null
          token_whitelist?: Json | null
          trade_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_api_health_metrics: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
