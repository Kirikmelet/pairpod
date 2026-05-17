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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      TrainingData: {
        Row: {
          contentID: number | null
          created_at: string
          source_type: string
          trainingID: number
        }
        Insert: {
          contentID?: number | null
          created_at?: string
          source_type: string
          trainingID?: number
        }
        Update: {
          contentID?: number | null
          created_at?: string
          source_type?: string
          trainingID?: number
        }
        Relationships: []
      }
      chat: {
        Row: {
          body: string | null
          chat_id: string
          created_at: string
          room_id: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          chat_id?: string
          created_at?: string
          room_id: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          chat_id?: string
          created_at?: string
          room_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_page_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes: number
          post_id: string | null
          reply_id: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes?: number
          post_id?: string | null
          reply_id?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes?: number
          post_id?: string
          reply_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_id: string | null
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_id?: string | null
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_thread_members: {
        Row: {
          created_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_thread_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_thread_reads: {
        Row: {
          created_at: string
          last_opened_at: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_opened_at?: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_opened_at?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_thread_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_thread_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_threads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          comment_id: string | null
          created_at: string
          event_type: string
          id: string
          page_id: string | null
          payload: Json
          post_id: string | null
          room_id: string | null
          user_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          page_id?: string | null
          payload?: Json
          post_id?: string | null
          room_id?: string | null
          user_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          page_id?: string | null
          payload?: Json
          post_id?: string | null
          room_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          id: string
          normalized_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_url: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_url?: string
        }
        Relationships: []
      }
      page_routes: {
        Row: {
          created_at: string
          id: string
          label: string | null
          page_id: string
          path: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          page_id: string
          path: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          page_id?: string
          path?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_routes_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_presence: {
        Row: {
          last_seen_at: string
          page_id: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          page_id: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          page_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_presence_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          content: string
          created_at: string
          header: string | null
          id: string
          likes: number
          room_id: string
          section_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          header?: string | null
          id?: string
          likes?: number
          room_id: string
          section_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          header?: string | null
          id?: string
          likes?: number
          room_id?: string
          section_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          configurations: Json
          created_at: string
          id: string
          max_users: number
          page_id: string
        }
        Insert: {
          configurations?: Json
          created_at?: string
          id?: string
          max_users?: number
          page_id: string
        }
        Update: {
          configurations?: Json
          created_at?: string
          id?: string
          max_users?: number
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          auth_user_id: string | null
          clothing_url: string | null
          configurations: Json
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          password: string | null
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          auth_user_id?: string | null
          clothing_url?: string | null
          configurations?: Json
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          password?: string | null
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          auth_user_id?: string | null
          clothing_url?: string | null
          configurations?: Json
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          password?: string | null
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_auth_user_id_fkey"
            columns: ["auth_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
