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
      audit: {
        Row: {
          accessibility_audit_url: string | null
          accessibility_grade: string | null
          accessibility_score: number | null
          business_phone: string | null
          company_logo_url: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          design_grade: string | null
          design_score: number | null
          id: string
          is_deleted: boolean
          legal_risk_flag: boolean | null
          location_city: string | null
          location_state: string | null
          overall_grade: string | null
          overall_score: number | null
          prepared_by_email: string | null
          prepared_by_name: string | null
          prepared_by_phone: string | null
          prepared_date: string | null
          presence_scan_image_url: string | null
          provider: string | null
          psi_audit_url: string | null
          psi_fetched_at: string | null
          psi_grade: string | null
          psi_last_error: string | null
          psi_mobile_score: number | null
          psi_status: string
          scheduler_url: string | null
          under_the_hood_graphic_url: string | null
          w3c_audit_url: string | null
          w3c_grade: string | null
          w3c_issue_count: number | null
          w3c_score: number | null
          wave_fetched_at: string | null
          wave_last_error: string | null
          wave_status: string
          website_screenshot_updated_at: string | null
          website_screenshot_url: string | null
          website_url: string | null
        }
        Insert: {
          accessibility_audit_url?: string | null
          accessibility_grade?: string | null
          accessibility_score?: number | null
          business_phone?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          design_grade?: string | null
          design_score?: number | null
          id?: string
          is_deleted?: boolean
          legal_risk_flag?: boolean | null
          location_city?: string | null
          location_state?: string | null
          overall_grade?: string | null
          overall_score?: number | null
          prepared_by_email?: string | null
          prepared_by_name?: string | null
          prepared_by_phone?: string | null
          prepared_date?: string | null
          presence_scan_image_url?: string | null
          provider?: string | null
          psi_audit_url?: string | null
          psi_fetched_at?: string | null
          psi_grade?: string | null
          psi_last_error?: string | null
          psi_mobile_score?: number | null
          psi_status?: string
          scheduler_url?: string | null
          under_the_hood_graphic_url?: string | null
          w3c_audit_url?: string | null
          w3c_grade?: string | null
          w3c_issue_count?: number | null
          w3c_score?: number | null
          wave_fetched_at?: string | null
          wave_last_error?: string | null
          wave_status?: string
          website_screenshot_updated_at?: string | null
          website_screenshot_url?: string | null
          website_url?: string | null
        }
        Update: {
          accessibility_audit_url?: string | null
          accessibility_grade?: string | null
          accessibility_score?: number | null
          business_phone?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          design_grade?: string | null
          design_score?: number | null
          id?: string
          is_deleted?: boolean
          legal_risk_flag?: boolean | null
          location_city?: string | null
          location_state?: string | null
          overall_grade?: string | null
          overall_score?: number | null
          prepared_by_email?: string | null
          prepared_by_name?: string | null
          prepared_by_phone?: string | null
          prepared_date?: string | null
          presence_scan_image_url?: string | null
          provider?: string | null
          psi_audit_url?: string | null
          psi_fetched_at?: string | null
          psi_grade?: string | null
          psi_last_error?: string | null
          psi_mobile_score?: number | null
          psi_status?: string
          scheduler_url?: string | null
          under_the_hood_graphic_url?: string | null
          w3c_audit_url?: string | null
          w3c_grade?: string | null
          w3c_issue_count?: number | null
          w3c_score?: number | null
          wave_fetched_at?: string | null
          wave_last_error?: string | null
          wave_status?: string
          website_screenshot_updated_at?: string | null
          website_screenshot_url?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      audit_share_views: {
        Row: {
          id: string
          ip_address: string | null
          referrer: string | null
          share_id: string
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          referrer?: string | null
          share_id: string
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          referrer?: string | null
          share_id?: string
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_share_views_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "audit_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_shares: {
        Row: {
          audit_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          first_viewed_at: string | null
          id: string
          is_active: boolean
          last_viewed_at: string | null
          notify_on_open: boolean
          opened_notified_at: string | null
          share_token: string
          short_token: string | null
          slug: string | null
          view_count: number
        }
        Insert: {
          audit_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          notify_on_open?: boolean
          opened_notified_at?: string | null
          share_token: string
          short_token?: string | null
          slug?: string | null
          view_count?: number
        }
        Update: {
          audit_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          notify_on_open?: boolean
          opened_notified_at?: string | null
          share_token?: string
          short_token?: string | null
          slug?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_shares_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean
          notify_on_open: boolean
          phone: string | null
          scheduler_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean
          notify_on_open?: boolean
          phone?: string | null
          scheduler_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          notify_on_open?: boolean
          phone?: string | null
          scheduler_url?: string | null
        }
        Relationships: []
      }
      scoring_settings: {
        Row: {
          grade_a_min: number
          grade_b_min: number
          grade_c_min: number
          grade_d_min: number
          id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
          w3c_issue_penalty: number
          weight_accessibility: number
          weight_design: number
          weight_psi_mobile: number
          weight_w3c: number
        }
        Insert: {
          grade_a_min?: number
          grade_b_min?: number
          grade_c_min?: number
          grade_d_min?: number
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
          w3c_issue_penalty?: number
          weight_accessibility?: number
          weight_design?: number
          weight_psi_mobile?: number
          weight_w3c?: number
        }
        Update: {
          grade_a_min?: number
          grade_b_min?: number
          grade_c_min?: number
          grade_d_min?: number
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
          w3c_issue_penalty?: number
          weight_accessibility?: number
          weight_design?: number
          weight_psi_mobile?: number
          weight_w3c?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recalculate_all_audits: { Args: { since_days?: number }; Returns: number }
      record_share_view: {
        Args: {
          p_ip_address?: string
          p_referrer?: string
          p_share_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      score_to_grade:
        | { Args: { score: number }; Returns: string }
        | {
            Args: {
              a_min?: number
              b_min?: number
              c_min?: number
              d_min?: number
              score: number
            }
            Returns: string
          }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
