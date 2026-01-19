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
          category: string
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
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
          is_enabled: boolean
          last_checked_at: string | null
          rate_limit_per_minute: number
          status: string
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
          is_enabled?: boolean
          last_checked_at?: string | null
          rate_limit_per_minute?: number
          status?: string
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
          is_enabled?: boolean
          last_checked_at?: string | null
          rate_limit_per_minute?: number
          status?: string
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
          is_success: boolean
          response_time_ms: number
          status_code: number
        }
        Insert: {
          api_type: string
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          is_success?: boolean
          response_time_ms: number
          status_code?: number
        }
        Update: {
          api_type?: string
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          is_success?: boolean
          response_time_ms?: number
          status_code?: number
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
          status: string
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
          status?: string
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
          status?: string
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
      positions: {
        Row: {
          amount: number
          chain: string
          closed_at: string | null
          created_at: string
          current_price: number
          current_value: number
          entry_price: number
          entry_value: number
          exit_price: number | null
          exit_reason: string | null
          exit_tx_id: string | null
          id: string
          profit_loss_percent: number | null
          profit_loss_value: number | null
          profit_take_percent: number
          status: string
          stop_loss_percent: number
          token_address: string
          token_name: string
          token_symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          chain?: string
          closed_at?: string | null
          created_at?: string
          current_price: number
          current_value: number
          entry_price: number
          entry_value: number
          exit_price?: number | null
          exit_reason?: string | null
          exit_tx_id?: string | null
          id?: string
          profit_loss_percent?: number | null
          profit_loss_value?: number | null
          profit_take_percent?: number
          status?: string
          stop_loss_percent?: number
          token_address: string
          token_name: string
          token_symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          chain?: string
          closed_at?: string | null
          created_at?: string
          current_price?: number
          current_value?: number
          entry_price?: number
          entry_value?: number
          exit_price?: number | null
          exit_reason?: string | null
          exit_tx_id?: string | null
          id?: string
          profit_loss_percent?: number | null
          profit_loss_value?: number | null
          profit_take_percent?: number
          status?: string
          stop_loss_percent?: number
          token_address?: string
          token_name?: string
          token_symbol?: string
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
          is_suspended: boolean
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_suspended?: boolean
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_suspended?: boolean
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      risk_check_logs: {
        Row: {
          checked_at: string
          id: string
          is_blacklisted: boolean | null
          is_honeypot: boolean | null
          metadata: Json | null
          passed_checks: boolean | null
          rejection_reasons: string[] | null
          risk_score: number | null
          token_address: string
          token_symbol: string | null
          user_id: string | null
        }
        Insert: {
          checked_at?: string
          id?: string
          is_blacklisted?: boolean | null
          is_honeypot?: boolean | null
          metadata?: Json | null
          passed_checks?: boolean | null
          rejection_reasons?: string[] | null
          risk_score?: number | null
          token_address: string
          token_symbol?: string | null
          user_id?: string | null
        }
        Update: {
          checked_at?: string
          id?: string
          is_blacklisted?: boolean | null
          is_honeypot?: boolean | null
          metadata?: Json | null
          passed_checks?: boolean | null
          rejection_reasons?: string[] | null
          risk_score?: number | null
          token_address?: string
          token_symbol?: string | null
          user_id?: string | null
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
          severity: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_category?: string
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_category?: string
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_signals: {
        Row: {
          chain: string
          created_at: string
          executed_at: string | null
          expires_at: string
          id: string
          is_pump_fun: boolean | null
          liquidity: number
          metadata: Json | null
          price_usd: number | null
          priority: string
          reasons: string[] | null
          risk_score: number | null
          slippage: number
          source: string | null
          status: string
          token_address: string
          token_name: string
          token_symbol: string
          trade_amount: number
          tx_signature: string | null
          user_id: string
        }
        Insert: {
          chain?: string
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string
          is_pump_fun?: boolean | null
          liquidity?: number
          metadata?: Json | null
          price_usd?: number | null
          priority?: string
          reasons?: string[] | null
          risk_score?: number | null
          slippage?: number
          source?: string | null
          status?: string
          token_address: string
          token_name: string
          token_symbol: string
          trade_amount: number
          tx_signature?: string | null
          user_id: string
        }
        Update: {
          chain?: string
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string
          is_pump_fun?: boolean | null
          liquidity?: number
          metadata?: Json | null
          price_usd?: number | null
          priority?: string
          reasons?: string[] | null
          risk_score?: number | null
          slippage?: number
          source?: string | null
          status?: string
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
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          activity_category?: string
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          activity_category?: string
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sniper_settings: {
        Row: {
          category_filters: string[] | null
          created_at: string
          id: string
          max_concurrent_trades: number
          min_liquidity: number
          priority: string
          profit_take_percentage: number
          stop_loss_percentage: number
          token_blacklist: string[] | null
          token_whitelist: string[] | null
          trade_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_filters?: string[] | null
          created_at?: string
          id?: string
          max_concurrent_trades?: number
          min_liquidity?: number
          priority?: string
          profit_take_percentage?: number
          stop_loss_percentage?: number
          token_blacklist?: string[] | null
          token_whitelist?: string[] | null
          trade_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_filters?: string[] | null
          created_at?: string
          id?: string
          max_concurrent_trades?: number
          min_liquidity?: number
          priority?: string
          profit_take_percentage?: number
          stop_loss_percentage?: number
          token_blacklist?: string[] | null
          token_whitelist?: string[] | null
          trade_amount?: number
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
      get_user_daily_pnl: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id?: string }
        Returns: {
          avg_pnl_percent: number
          losing_trades: number
          net_pnl: number
          total_trades: number
          total_volume: number
          trade_date: string
          user_id: string
          winning_trades: number
        }[]
      }
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
