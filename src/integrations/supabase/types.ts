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
          company_name: string | null
          created_at: string
          design_grade: string | null
          design_score: number | null
          id: string
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
          psi_grade: string | null
          psi_mobile_score: number | null
          under_the_hood_graphic_url: string | null
          w3c_audit_url: string | null
          w3c_grade: string | null
          w3c_issue_count: number | null
          w3c_score: number | null
          website_url: string | null
        }
        Insert: {
          accessibility_audit_url?: string | null
          accessibility_grade?: string | null
          accessibility_score?: number | null
          company_name?: string | null
          created_at?: string
          design_grade?: string | null
          design_score?: number | null
          id?: string
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
          psi_grade?: string | null
          psi_mobile_score?: number | null
          under_the_hood_graphic_url?: string | null
          w3c_audit_url?: string | null
          w3c_grade?: string | null
          w3c_issue_count?: number | null
          w3c_score?: number | null
          website_url?: string | null
        }
        Update: {
          accessibility_audit_url?: string | null
          accessibility_grade?: string | null
          accessibility_score?: number | null
          company_name?: string | null
          created_at?: string
          design_grade?: string | null
          design_score?: number | null
          id?: string
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
          psi_grade?: string | null
          psi_mobile_score?: number | null
          under_the_hood_graphic_url?: string | null
          w3c_audit_url?: string | null
          w3c_grade?: string | null
          w3c_issue_count?: number | null
          w3c_score?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      score_to_grade: { Args: { score: number }; Returns: string }
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
