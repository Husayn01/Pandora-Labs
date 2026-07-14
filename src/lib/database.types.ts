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
      approval_decisions: {
        Row: {
          action_payload_hash: string
          action_type: string
          actor_user_id: string
          approval_idempotency_key: string
          approval_request_id: string
          decided_at: string
          decision: string
          decision_idempotency_key: string
          id: string
          organization_id: string
        }
        Insert: {
          action_payload_hash: string
          action_type: string
          actor_user_id: string
          approval_idempotency_key: string
          approval_request_id: string
          decided_at?: string
          decision: string
          decision_idempotency_key: string
          id?: string
          organization_id: string
        }
        Update: {
          action_payload_hash?: string
          action_type?: string
          actor_user_id?: string
          approval_idempotency_key?: string
          approval_request_id?: string
          decided_at?: string
          decision?: string
          decision_idempotency_key?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: true
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          action_payload_hash: string
          action_preview: Json
          action_type: string
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          id: string
          idempotency_key: string
          organization_id: string
          requested_by: string | null
          risk_level: string
          status: string
        }
        Insert: {
          action_payload_hash: string
          action_preview: Json
          action_type: string
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at: string
          id?: string
          idempotency_key: string
          organization_id: string
          requested_by?: string | null
          risk_level: string
          status?: string
        }
        Update: {
          action_payload_hash?: string
          action_preview?: Json
          action_type?: string
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          requested_by?: string | null
          risk_level?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string
          id: string
          organization_id: string
          provider: string
          provider_customer_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          organization_id: string
          provider?: string
          provider_customer_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          organization_id?: string
          provider?: string
          provider_customer_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          organization_id: string | null
          payload_hash: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          signature_verified: boolean
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          organization_id?: string | null
          payload_hash: string
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          signature_verified?: boolean
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string | null
          payload_hash?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_identities: {
        Row: {
          channel: string
          created_at: string
          display_hint: string | null
          external_id_hash: string
          id: string
          metadata: Json
          organization_id: string
          role: string
          updated_at: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          display_hint?: string | null
          external_id_hash: string
          id?: string
          metadata?: Json
          organization_id: string
          role?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          display_hint?: string | null
          external_id_hash?: string
          id?: string
          metadata?: Json
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_identities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_link_tokens: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          display_hint: string | null
          expires_at: string
          external_id_hash: string | null
          id: string
          organization_id: string
          redeemed_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          display_hint?: string | null
          expires_at: string
          external_id_hash?: string | null
          id?: string
          organization_id: string
          redeemed_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          display_hint?: string | null
          expires_at?: string
          external_id_hash?: string | null
          id?: string
          organization_id?: string
          redeemed_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_link_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          actor_user_id: string | null
          channel: string | null
          correlation_id: string | null
          created_at: string
          elevenlabs_conversation_id: string | null
          external_channel: string | null
          external_user_id: string | null
          id: string
          metadata: Json
          organization_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          channel?: string | null
          correlation_id?: string | null
          created_at?: string
          elevenlabs_conversation_id?: string | null
          external_channel?: string | null
          external_user_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          channel?: string | null
          correlation_id?: string | null
          created_at?: string
          elevenlabs_conversation_id?: string | null
          external_channel?: string | null
          external_user_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          connected_by: string | null
          created_at: string
          external_account_id: string | null
          external_account_label: string | null
          id: string
          last_checked_at: string | null
          last_error_code: string | null
          metadata: Json
          organization_id: string
          provider: string
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          connected_by?: string | null
          created_at?: string
          external_account_id?: string | null
          external_account_label?: string | null
          id?: string
          last_checked_at?: string | null
          last_error_code?: string | null
          metadata?: Json
          organization_id: string
          provider: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          connected_by?: string | null
          created_at?: string
          external_account_id?: string | null
          external_account_label?: string | null
          id?: string
          last_checked_at?: string | null
          last_error_code?: string | null
          metadata?: Json
          organization_id?: string
          provider?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          provider: string
          redirect_uri: string
          state_hash: string
          user_id: string
          verifier_secret_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          provider: string
          redirect_uri: string
          state_hash: string
          user_id: string
          verifier_secret_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          provider?: string
          redirect_uri?: string
          state_hash?: string
          user_id?: string
          verifier_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_oauth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          total_minor: number
          unit_price_minor: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          total_minor: number
          unit_price_minor: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          total_minor?: number
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_email: string | null
          customer_name: string
          due_at: string | null
          id: string
          invoice_number: string
          metadata: Json
          notes: string | null
          organization_id: string
          status: string
          subtotal_minor: number
          tax_minor: number
          total_minor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name: string
          due_at?: string | null
          id?: string
          invoice_number: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          status?: string
          subtotal_minor?: number
          tax_minor?: number
          total_minor?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string
          due_at?: string | null
          id?: string
          invoice_number?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          status?: string
          subtotal_minor?: number
          tax_minor?: number
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          byte_size: number
          created_at: string
          created_by: string | null
          elevenlabs_document_id: string | null
          id: string
          metadata: Json
          organization_id: string
          source_type: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          byte_size?: number
          created_at?: string
          created_by?: string | null
          elevenlabs_document_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          source_type: string
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          created_by?: string | null
          elevenlabs_document_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          source_type?: string
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          sender_type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          sender_type: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          business_profile: Json
          created_at: string
          id: string
          locale: string
          name: string
          owner_user_id: string
          plan_code: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_profile?: Json
          created_at?: string
          id?: string
          locale?: string
          name: string
          owner_user_id: string
          plan_code?: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_profile?: Json
          created_at?: string
          id?: string
          locale?: string
          name?: string
          owner_user_id?: string
          plan_code?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_entitlements: {
        Row: {
          features: Json
          monthly_price_minor: number
          plan_code: string
          seat_limit: number | null
          total_voice_seconds_limit: number | null
          web_command_limit: number | null
          web_voice_seconds_limit: number | null
        }
        Insert: {
          features?: Json
          monthly_price_minor: number
          plan_code: string
          seat_limit?: number | null
          total_voice_seconds_limit?: number | null
          web_command_limit?: number | null
          web_voice_seconds_limit?: number | null
        }
        Update: {
          features?: Json
          monthly_price_minor?: number
          plan_code?: string
          seat_limit?: number | null
          total_voice_seconds_limit?: number | null
          web_command_limit?: number | null
          web_voice_seconds_limit?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          onboarding_completed_at: string | null
          phone_number: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          onboarding_completed_at?: string | null
          phone_number?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          onboarding_completed_at?: string | null
          phone_number?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          delivery_channel: string
          id: string
          idempotency_key: string | null
          metadata: Json
          organization_id: string
          remind_at: string
          status: string
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          delivery_channel?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          organization_id: string
          remind_at: string
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          delivery_channel?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          organization_id?: string
          remind_at?: string
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_customer_id: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          plan_code: string
          provider_plan_code: string | null
          provider_subscription_code: string | null
          status: string
          updated_at: string
          voice_credit_minor: number
        }
        Insert: {
          billing_customer_id?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          plan_code?: string
          provider_plan_code?: string | null
          provider_subscription_code?: string | null
          status?: string
          updated_at?: string
          voice_credit_minor?: number
        }
        Update: {
          billing_customer_id?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          plan_code?: string
          provider_plan_code?: string | null
          provider_subscription_code?: string | null
          status?: string
          updated_at?: string
          voice_credit_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          organization_id: string
          priority: string
          source_channel: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          organization_id: string
          priority?: string
          source_channel?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          organization_id?: string
          priority?: string
          source_channel?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          metric: string
          organization_id: string
          period_key: string
          quantity: number
          updated_at: string
        }
        Insert: {
          metric: string
          organization_id: string
          period_key: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          metric?: string
          organization_id?: string
          period_key?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          id: string
          metadata: Json
          metric: string
          occurred_at: string
          organization_id: string
          period_key: string
          quantity: number
          source_id: string
        }
        Insert: {
          id?: string
          metadata?: Json
          metric: string
          occurred_at?: string
          organization_id: string
          period_key: string
          quantity: number
          source_id: string
        }
        Update: {
          id?: string
          metadata?: Json
          metric?: string
          occurred_at?: string
          organization_id?: string
          period_key?: string
          quantity?: number
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_events: {
        Row: {
          actor_user_id: string | null
          conversation_id: string | null
          correlation_id: string
          created_at: string
          event_type: string
          execution_id: string | null
          id: string
          idempotency_key: string | null
          organization_id: string
          redacted_payload: Json
          status: string
          summary: string | null
          workflow_name: string
        }
        Insert: {
          actor_user_id?: string | null
          conversation_id?: string | null
          correlation_id: string
          created_at?: string
          event_type: string
          execution_id?: string | null
          id?: string
          idempotency_key?: string | null
          organization_id: string
          redacted_payload?: Json
          status?: string
          summary?: string | null
          workflow_name: string
        }
        Update: {
          actor_user_id?: string | null
          conversation_id?: string | null
          correlation_id?: string
          created_at?: string
          event_type?: string
          execution_id?: string | null
          id?: string
          idempotency_key?: string | null
          organization_id?: string
          redacted_payload?: Json
          status?: string
          summary?: string | null
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_paystack_subscription_event: {
        Args: {
          p_customer_code: string
          p_email: string
          p_organization_id: string
          p_period_end?: string | null
          p_period_start?: string
          p_plan_code: string
          p_provider_plan_code: string
          p_subscription_code: string
        }
        Returns: undefined
      }
      decide_approval: {
        Args: {
          p_actor_user_id: string
          p_approval_request_id: string
          p_decision: string
          p_decision_idempotency_key: string
          p_expected_approval_idempotency_key: string
          p_expected_payload_hash: string
          p_organization_id: string
        }
        Returns: Json
      }
      delete_integration_secret: {
        Args: { secret_id: string }
        Returns: undefined
      }
      read_integration_secret: { Args: { secret_id: string }; Returns: string }
      reserve_web_command_usage: {
        Args: {
          p_organization_id: string
          p_period_key: string
          p_source_id: string
        }
        Returns: boolean
      }
      set_subscription_status: {
        Args: { p_organization_id: string; p_status: string }
        Returns: undefined
      }
      store_integration_secret: {
        Args: {
          secret_description?: string
          secret_name: string
          secret_value: string
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
