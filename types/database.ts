// Hand-authored to mirror supabase/migrations/20260620090000_init.sql.
// Regenerate from the live DB with:
//   supabase gen types typescript --linked > types/database.ts
// Keep in sync when the schema changes.

export type MemberRole = 'owner' | 'editor'
export type MembershipStatus = 'pending' | 'requested' | 'active'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      workspaces: {
        Row: { id: string; name: string; owner_id: string; created_at: string }
        Insert: { id?: string; name: string; owner_id: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          workspace_id: string
          name: string
          icon: string | null
          position: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          icon?: string | null
          position?: number
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
        Relationships: []
      }
      memberships: {
        Row: {
          id: string
          workspace_id: string
          user_id: string | null
          invited_email: string
          role: MemberRole
          status: MembershipStatus
          invited_by: string | null
          created_at: string
          joined_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id?: string | null
          invited_email: string
          role?: MemberRole
          status?: MembershipStatus
          invited_by?: string | null
          created_at?: string
          joined_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          workspace_id: string
          team_id: string
          name: string
          icon: string | null
          position: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          team_id: string
          name: string
          icon?: string | null
          position?: number
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['projects']['Insert']>
        Relationships: []
      }
      favorites: {
        Row: {
          user_id: string
          workspace_id: string
          target_type: string
          target_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          workspace_id: string
          target_type: string
          target_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['favorites']['Insert']>
        Relationships: []
      }
      recents: {
        Row: {
          user_id: string
          workspace_id: string
          target_type: string
          target_id: string
          visited_at: string
        }
        Insert: {
          user_id: string
          workspace_id: string
          target_type: string
          target_id: string
          visited_at?: string
        }
        Update: Partial<Database['public']['Tables']['recents']['Insert']>
        Relationships: []
      }
      yjs_documents: {
        Row: {
          doc_type: string
          doc_id: string
          workspace_id: string
          state: string
          seq: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          doc_type: string
          doc_id: string
          workspace_id: string
          state: string
          seq?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['yjs_documents']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      bootstrap_workspace: {
        Args: { p_name: string }
        Returns: string
      }
      workspace_exists: {
        Args: Record<string, never>
        Returns: boolean
      }
      invite_member: {
        Args: { p_email: string }
        Returns: undefined
      }
      request_access: {
        Args: Record<string, never>
        Returns: undefined
      }
      my_membership_status: {
        Args: Record<string, never>
        Returns: string | null
      }
      is_workspace_member: {
        Args: { p_workspace: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { p_workspace: string }
        Returns: boolean
      }
      current_user_role: {
        Args: { p_workspace: string }
        Returns: MemberRole
      }
      are_co_members: {
        Args: { p_user: string }
        Returns: boolean
      }
      save_yjs_snapshot: {
        Args: {
          p_doc_type: string
          p_doc_id: string
          p_workspace_id: string
          p_state_b64: string
        }
        Returns: undefined
      }
      load_yjs_snapshot: {
        Args: { p_doc_type: string; p_doc_id: string }
        Returns: string | null
      }
    }
    Enums: {
      member_role: MemberRole
    }
    CompositeTypes: Record<string, never>
  }
}
