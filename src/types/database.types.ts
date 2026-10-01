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
      assessment_clinical_context: {
        Row: {
          age_years: number
          assessment_id: string
          body_region_id: string
          client_event_id: string
          concern_id: string
          face_subregion_id: string | null
          recorded_at: string
          reporter: string | null
          sex_for_assessment: string
        }
        Insert: {
          age_years: number
          assessment_id: string
          body_region_id: string
          client_event_id: string
          concern_id: string
          face_subregion_id?: string | null
          recorded_at?: string
          reporter?: string | null
          sex_for_assessment: string
        }
        Update: {
          age_years?: number
          assessment_id?: string
          body_region_id?: string
          client_event_id?: string
          concern_id?: string
          face_subregion_id?: string | null
          recorded_at?: string
          reporter?: string | null
          sex_for_assessment?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_clinical_context_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_sessions: {
        Row: {
          complaint_id: string | null
          complaint_source: string | null
          contract_version: string
          created_at: string
          deployment_mode: string
          engine_version: string
          facility_id: string | null
          id: string
          initiated_by_staff_profile_id: string | null
          kiosk_device_id: string | null
          knowledge_version: string
          owner_auth_user_id: string | null
          safety_version: string
          status: string
          updated_at: string
        }
        Insert: {
          complaint_id?: string | null
          complaint_source?: string | null
          contract_version: string
          created_at?: string
          deployment_mode: string
          engine_version: string
          facility_id?: string | null
          id?: string
          initiated_by_staff_profile_id?: string | null
          kiosk_device_id?: string | null
          knowledge_version: string
          owner_auth_user_id?: string | null
          safety_version: string
          status?: string
          updated_at?: string
        }
        Update: {
          complaint_id?: string | null
          complaint_source?: string | null
          contract_version?: string
          created_at?: string
          deployment_mode?: string
          engine_version?: string
          facility_id?: string | null
          id?: string
          initiated_by_staff_profile_id?: string | null
          kiosk_device_id?: string | null
          knowledge_version?: string
          owner_auth_user_id?: string | null
          safety_version?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_device_facility_fk"
            columns: ["kiosk_device_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id", "facility_id"]
          },
          {
            foreignKeyName: "assessment_sessions_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_sessions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_staff_facility_fk"
            columns: ["initiated_by_staff_profile_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id", "facility_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_staff_profile_id: string | null
          assessment_id: string
          client_event_id: string
          clinical_handoff_id: string | null
          from_status: string | null
          id: string
          kind: string
          occurred_at: string
          override_action: string | null
          override_automatic_continuation_enabled: boolean | null
          override_fired_rule_ids: string[] | null
          override_original_continuation_policy: string | null
          override_original_payload_id: string | null
          override_reason: string | null
          reason_code: string | null
          recorded_at: string
          to_status: string | null
        }
        Insert: {
          actor_staff_profile_id?: string | null
          assessment_id: string
          client_event_id: string
          clinical_handoff_id?: string | null
          from_status?: string | null
          id?: string
          kind: string
          occurred_at: string
          override_action?: string | null
          override_automatic_continuation_enabled?: boolean | null
          override_fired_rule_ids?: string[] | null
          override_original_continuation_policy?: string | null
          override_original_payload_id?: string | null
          override_reason?: string | null
          reason_code?: string | null
          recorded_at?: string
          to_status?: string | null
        }
        Update: {
          actor_staff_profile_id?: string | null
          assessment_id?: string
          client_event_id?: string
          clinical_handoff_id?: string | null
          from_status?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          override_action?: string | null
          override_automatic_continuation_enabled?: boolean | null
          override_fired_rule_ids?: string[] | null
          override_original_continuation_policy?: string | null
          override_original_payload_id?: string | null
          override_reason?: string | null
          reason_code?: string | null
          recorded_at?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_staff_profile_id_fkey"
            columns: ["actor_staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_handoff_same_assessment_fk"
            columns: ["assessment_id", "clinical_handoff_id"]
            isOneToOne: false
            referencedRelation: "clinical_handoffs"
            referencedColumns: ["assessment_id", "id"]
          },
        ]
      }
      body_selections: {
        Row: {
          assessment_id: string
          body_domain_version: string
          captured_at: string
          client_event_id: string
          id: string
          point_x: number | null
          point_y: number | null
          precision: string
          recorded_at: string
          region_id: string
          supersedes_record_id: string | null
          view: string
        }
        Insert: {
          assessment_id: string
          body_domain_version: string
          captured_at: string
          client_event_id: string
          id?: string
          point_x?: number | null
          point_y?: number | null
          precision: string
          recorded_at?: string
          region_id: string
          supersedes_record_id?: string | null
          view: string
        }
        Update: {
          assessment_id?: string
          body_domain_version?: string
          captured_at?: string
          client_event_id?: string
          id?: string
          point_x?: number | null
          point_y?: number | null
          precision?: string
          recorded_at?: string
          region_id?: string
          supersedes_record_id?: string | null
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_selections_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_supersedes_same_assessment_fk"
            columns: ["assessment_id", "supersedes_record_id"]
            isOneToOne: false
            referencedRelation: "body_selections"
            referencedColumns: ["assessment_id", "id"]
          },
        ]
      }
      canonical_clinical_outcomes: {
        Row: {
          assessment_id: string
          body_selection_id: string | null
          client_event_id: string
          evidence_refs: Json
          facility_id: string | null
          handoff_status: string | null
          id: string
          outcome: Json
          recorded_at: string
          soap_schema_version: string | null
          soap_sections: Json | null
          specialty_id: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          body_selection_id?: string | null
          client_event_id: string
          evidence_refs?: Json
          facility_id?: string | null
          handoff_status?: string | null
          id?: string
          outcome: Json
          recorded_at?: string
          soap_schema_version?: string | null
          soap_sections?: Json | null
          specialty_id?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          body_selection_id?: string | null
          client_event_id?: string
          evidence_refs?: Json
          facility_id?: string | null
          handoff_status?: string | null
          id?: string
          outcome?: Json
          recorded_at?: string
          soap_schema_version?: string | null
          soap_sections?: Json | null
          specialty_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_clinical_outcomes_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_clinical_outcomes_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_clinical_outcomes_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_outcome_body_fk"
            columns: ["assessment_id", "body_selection_id"]
            isOneToOne: false
            referencedRelation: "body_selections"
            referencedColumns: ["assessment_id", "id"]
          },
          {
            foreignKeyName: "canonical_outcome_facility_fk"
            columns: ["assessment_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id", "facility_id"]
          },
        ]
      }
      canonical_handoff_events: {
        Row: {
          actor_staff_profile_id: string
          assessment_id: string
          client_event_id: string
          from_status: string
          id: string
          occurred_at: string
          outcome_id: string
          to_status: string
        }
        Insert: {
          actor_staff_profile_id: string
          assessment_id: string
          client_event_id: string
          from_status: string
          id?: string
          occurred_at?: string
          outcome_id: string
          to_status: string
        }
        Update: {
          actor_staff_profile_id?: string
          assessment_id?: string
          client_event_id?: string
          from_status?: string
          id?: string
          occurred_at?: string
          outcome_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_handoff_events_actor_staff_profile_id_fkey"
            columns: ["actor_staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_handoff_events_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_handoff_outcome_same_assessment_fk"
            columns: ["assessment_id", "outcome_id"]
            isOneToOne: false
            referencedRelation: "canonical_clinical_outcomes"
            referencedColumns: ["assessment_id", "id"]
          },
        ]
      }
      clinical_handoffs: {
        Row: {
          assessment_id: string
          created_at: string
          facility_id: string
          id: string
          soap_handoff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          facility_id: string
          id?: string
          soap_handoff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          facility_id?: string
          id?: string
          soap_handoff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_handoffs_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_same_facility_fk"
            columns: ["assessment_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id", "facility_id"]
          },
          {
            foreignKeyName: "handoff_soap_same_assessment_fk"
            columns: ["assessment_id", "soap_handoff_id"]
            isOneToOne: false
            referencedRelation: "soap_handoffs"
            referencedColumns: ["assessment_id", "id"]
          },
        ]
      }
      complaints: {
        Row: {
          id: string
          knowledge_version: string
          label: string
          provenance_ids: string[]
        }
        Insert: {
          id: string
          knowledge_version: string
          label: string
          provenance_ids: string[]
        }
        Update: {
          id?: string
          knowledge_version?: string
          label?: string
          provenance_ids?: string[]
        }
        Relationships: []
      }
      facilities: {
        Row: {
          display_name: string
          enabled: boolean
          id: string
        }
        Insert: {
          display_name: string
          enabled?: boolean
          id?: string
        }
        Update: {
          display_name?: string
          enabled?: boolean
          id?: string
        }
        Relationships: []
      }
      intake_answers: {
        Row: {
          answered_at: string
          assessment_id: string
          category: string
          client_event_id: string
          id: string
          operation: string
          option_id: string | null
          question_id: string
          recorded_at: string
          sequence: number
          supersedes_record_id: string | null
        }
        Insert: {
          answered_at: string
          assessment_id: string
          category: string
          client_event_id: string
          id?: string
          operation: string
          option_id?: string | null
          question_id: string
          recorded_at?: string
          sequence: number
          supersedes_record_id?: string | null
        }
        Update: {
          answered_at?: string
          assessment_id?: string
          category?: string
          client_event_id?: string
          id?: string
          operation?: string
          option_id?: string | null
          question_id?: string
          recorded_at?: string
          sequence?: number
          supersedes_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_supersedes_same_question_fk"
            columns: ["assessment_id", "question_id", "supersedes_record_id"]
            isOneToOne: false
            referencedRelation: "intake_answers"
            referencedColumns: ["assessment_id", "question_id", "id"]
          },
        ]
      }
      kiosk_devices: {
        Row: {
          enabled: boolean
          facility_id: string
          id: string
          mode: string
        }
        Insert: {
          enabled?: boolean
          facility_id: string
          id?: string
          mode: string
        }
        Update: {
          enabled?: boolean
          facility_id?: string
          id?: string
          mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_devices_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_answers: {
        Row: {
          answered_at: string
          assessment_id: string
          client_event_id: string
          id: string
          knowledge_version: string
          operation: string
          option_id: string | null
          question_id: string
          recorded_at: string
          sequence: number
          supersedes_record_id: string | null
        }
        Insert: {
          answered_at: string
          assessment_id: string
          client_event_id: string
          id?: string
          knowledge_version: string
          operation: string
          option_id?: string | null
          question_id: string
          recorded_at?: string
          sequence: number
          supersedes_record_id?: string | null
        }
        Update: {
          answered_at?: string
          assessment_id?: string
          client_event_id?: string
          id?: string
          knowledge_version?: string
          operation?: string
          option_id?: string | null
          question_id?: string
          recorded_at?: string
          sequence?: number
          supersedes_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routing_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_supersedes_same_question_fk"
            columns: ["assessment_id", "question_id", "supersedes_record_id"]
            isOneToOne: false
            referencedRelation: "routing_answers"
            referencedColumns: ["assessment_id", "question_id", "id"]
          },
        ]
      }
      routing_result_supporting_answers: {
        Row: {
          assessment_id: string
          ordinal: number
          routing_answer_id: string
          routing_result_id: string
        }
        Insert: {
          assessment_id: string
          ordinal: number
          routing_answer_id: string
          routing_result_id: string
        }
        Update: {
          assessment_id?: string
          ordinal?: number
          routing_answer_id?: string
          routing_result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_support_answer_fk"
            columns: ["assessment_id", "routing_answer_id"]
            isOneToOne: false
            referencedRelation: "routing_answers"
            referencedColumns: ["assessment_id", "id"]
          },
          {
            foreignKeyName: "result_support_result_fk"
            columns: ["assessment_id", "routing_result_id"]
            isOneToOne: false
            referencedRelation: "routing_results"
            referencedColumns: ["assessment_id", "id"]
          },
        ]
      }
      routing_results: {
        Row: {
          assessment_id: string
          belief_cardiology: number
          belief_dermatology: number
          belief_gastroenterology: number
          belief_neurology: number
          belief_orthopedics: number
          belief_pulmonology: number
          client_event_id: string
          engine_top_specialty_id: string
          generated_at: string
          id: string
          recorded_at: string
          selected_specialty_registry_id: string
          stop_reason: string
          supersedes_result_id: string | null
        }
        Insert: {
          assessment_id: string
          belief_cardiology: number
          belief_dermatology: number
          belief_gastroenterology: number
          belief_neurology: number
          belief_orthopedics: number
          belief_pulmonology: number
          client_event_id: string
          engine_top_specialty_id: string
          generated_at: string
          id?: string
          recorded_at?: string
          selected_specialty_registry_id: string
          stop_reason: string
          supersedes_result_id?: string | null
        }
        Update: {
          assessment_id?: string
          belief_cardiology?: number
          belief_dermatology?: number
          belief_gastroenterology?: number
          belief_neurology?: number
          belief_orthopedics?: number
          belief_pulmonology?: number
          client_event_id?: string
          engine_top_specialty_id?: string
          generated_at?: string
          id?: string
          recorded_at?: string
          selected_specialty_registry_id?: string
          stop_reason?: string
          supersedes_result_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routing_result_supersedes_same_assessment_fk"
            columns: ["assessment_id", "supersedes_result_id"]
            isOneToOne: false
            referencedRelation: "routing_results"
            referencedColumns: ["assessment_id", "id"]
          },
          {
            foreignKeyName: "routing_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_results_selected_specialty_registry_id_fkey"
            columns: ["selected_specialty_registry_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_answers: {
        Row: {
          answered_at: string
          assessment_id: string
          client_event_id: string
          id: string
          operation: string
          option_id: string | null
          question_id: string
          recorded_at: string
          safety_version: string
          sequence: number
          supersedes_record_id: string | null
        }
        Insert: {
          answered_at: string
          assessment_id: string
          client_event_id: string
          id?: string
          operation: string
          option_id?: string | null
          question_id: string
          recorded_at?: string
          safety_version: string
          sequence: number
          supersedes_record_id?: string | null
        }
        Update: {
          answered_at?: string
          assessment_id?: string
          client_event_id?: string
          id?: string
          operation?: string
          option_id?: string | null
          question_id?: string
          recorded_at?: string
          safety_version?: string
          sequence?: number
          supersedes_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_answer_supersedes_same_question_fk"
            columns: ["assessment_id", "question_id", "supersedes_record_id"]
            isOneToOne: false
            referencedRelation: "safety_answers"
            referencedColumns: ["assessment_id", "question_id", "id"]
          },
          {
            foreignKeyName: "safety_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_event_evidence: {
        Row: {
          assessment_id: string
          ordinal: number
          routing_answer_id: string | null
          safety_answer_id: string | null
          safety_event_id: string
        }
        Insert: {
          assessment_id: string
          ordinal: number
          routing_answer_id?: string | null
          safety_answer_id?: string | null
          safety_event_id: string
        }
        Update: {
          assessment_id?: string
          ordinal?: number
          routing_answer_id?: string | null
          safety_answer_id?: string | null
          safety_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_evidence_event_fk"
            columns: ["assessment_id", "safety_event_id"]
            isOneToOne: false
            referencedRelation: "safety_events"
            referencedColumns: ["assessment_id", "id"]
          },
          {
            foreignKeyName: "safety_evidence_routing_fk"
            columns: ["assessment_id", "routing_answer_id"]
            isOneToOne: false
            referencedRelation: "routing_answers"
            referencedColumns: ["assessment_id", "id"]
          },
          {
            foreignKeyName: "safety_evidence_safety_fk"
            columns: ["assessment_id", "safety_answer_id"]
            isOneToOne: false
            referencedRelation: "safety_answers"
            referencedColumns: ["assessment_id", "id"]
          },
        ]
      }
      safety_events: {
        Row: {
          assessment_id: string
          assessment_status_at_trigger: string
          client_event_id: string
          continuation_policy: string
          fired_rule_ids: string[]
          id: string
          payload_id: string
          recorded_at: string
          rule_version: string
          selected_rule_id: string
          severity: string
          triggered_at: string
        }
        Insert: {
          assessment_id: string
          assessment_status_at_trigger: string
          client_event_id: string
          continuation_policy: string
          fired_rule_ids: string[]
          id?: string
          payload_id: string
          recorded_at?: string
          rule_version: string
          selected_rule_id: string
          severity: string
          triggered_at: string
        }
        Update: {
          assessment_id?: string
          assessment_status_at_trigger?: string
          client_event_id?: string
          continuation_policy?: string
          fired_rule_ids?: string[]
          id?: string
          payload_id?: string
          recorded_at?: string
          rule_version?: string
          selected_rule_id?: string
          severity?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_events_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      soap_handoffs: {
        Row: {
          assessment_id: string
          client_event_id: string
          generated_at: string
          id: string
          recorded_at: string
          routing_result_id: string
          sections: Json
          soap_schema_version: string
          supersedes_handoff_id: string | null
        }
        Insert: {
          assessment_id: string
          client_event_id: string
          generated_at: string
          id?: string
          recorded_at?: string
          routing_result_id: string
          sections: Json
          soap_schema_version: string
          supersedes_handoff_id?: string | null
        }
        Update: {
          assessment_id?: string
          client_event_id?: string
          generated_at?: string
          id?: string
          recorded_at?: string
          routing_result_id?: string
          sections?: Json
          soap_schema_version?: string
          supersedes_handoff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soap_handoffs_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_result_same_assessment_fk"
            columns: ["assessment_id", "routing_result_id"]
            isOneToOne: false
            referencedRelation: "routing_results"
            referencedColumns: ["assessment_id", "id"]
          },
          {
            foreignKeyName: "soap_supersedes_same_assessment_fk"
            columns: ["assessment_id", "supersedes_handoff_id"]
            isOneToOne: false
            referencedRelation: "soap_handoffs"
            referencedColumns: ["assessment_id", "id"]
          },
        ]
      }
      specialties: {
        Row: {
          canonical_name: string
          category: string
          engine_specialty_id: string | null
          evidence_status: string
          id: string
          patient_facing_name: string
          routing_enabled: boolean
          source: string
        }
        Insert: {
          canonical_name: string
          category: string
          engine_specialty_id?: string | null
          evidence_status: string
          id: string
          patient_facing_name: string
          routing_enabled: boolean
          source: string
        }
        Update: {
          canonical_name?: string
          category?: string
          engine_specialty_id?: string | null
          evidence_status?: string
          id?: string
          patient_facing_name?: string
          routing_enabled?: boolean
          source?: string
        }
        Relationships: []
      }
      specialty_supported_complaints: {
        Row: {
          complaint_id: string
          ordinal: number
          specialty_id: string
        }
        Insert: {
          complaint_id: string
          ordinal: number
          specialty_id: string
        }
        Update: {
          complaint_id?: string
          ordinal?: number
          specialty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialty_supported_complaints_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialty_supported_complaints_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          auth_user_id: string
          enabled: boolean
          facility_id: string
          id: string
          role: string
        }
        Insert: {
          auth_user_id: string
          enabled?: boolean
          facility_id: string
          id?: string
          role: string
        }
        Update: {
          auth_user_id?: string
          enabled?: boolean
          facility_id?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      trusted_acknowledge_handoff: {
        Args: {
          p_actor_auth_user_id: string
          p_client_event_id: string
          p_handoff_id: string
        }
        Returns: Json
      }
      trusted_admission_shape_ok: {
        Args: { p_assessment_id: string }
        Returns: boolean
      }
      trusted_admit_staffed_assessment: {
        Args: {
          p_client_event_id: string
          p_complaint_id: string
          p_complaint_source: string
          p_contract_version: string
          p_engine_version: string
          p_knowledge_version: string
          p_patient_auth_user_id: string
          p_safety_version: string
          p_staff_auth_user_id: string
        }
        Returns: Json
      }
      trusted_end_assessment: {
        Args: {
          p_assessment_id: string
          p_client_event_id: string
          p_owner_auth_user_id: string
        }
        Returns: Json
      }
      trusted_evidence_is_active: {
        Args: { p_assessment_id: string; p_record_id: string; p_table: string }
        Returns: boolean
      }
      trusted_evidence_is_current: {
        Args: {
          p_assessment_id: string
          p_intake_high_water: number
          p_routing_high_water: number
          p_safety_high_water: number
        }
        Returns: boolean
      }
      trusted_finalize_canonical_clinical: {
        Args: {
          p_assessment_id: string
          p_body_record_id: string
          p_client_event_id: string
          p_evidence_refs: Json
          p_intake_high_water: number
          p_outcome: Json
          p_owner_auth_user_id: string
          p_routing_high_water: number
          p_safety_high_water: number
          p_sections: Json
        }
        Returns: Json
      }
      trusted_finalize_routing: {
        Args: {
          p_assessment_id: string
          p_belief_cardiology: number
          p_belief_dermatology: number
          p_belief_gastroenterology: number
          p_belief_neurology: number
          p_belief_orthopedics: number
          p_belief_pulmonology: number
          p_client_event_id: string
          p_engine_top_specialty_id: string
          p_intake_high_water: number
          p_owner_auth_user_id: string
          p_routing_high_water: number
          p_safety_high_water: number
          p_selected_specialty_registry_id: string
          p_stop_reason: string
          p_supporting_answer_ids: string[]
        }
        Returns: Json
      }
      trusted_is_anonymous_principal: {
        Args: { p_auth_user_id: string }
        Returns: boolean
      }
      trusted_open_handoff: {
        Args: {
          p_actor_auth_user_id: string
          p_client_event_id: string
          p_handoff_id: string
        }
        Returns: Json
      }
      trusted_prepare_soap_handoff: {
        Args: {
          p_assessment_id: string
          p_body_record_id: string
          p_client_event_id: string
          p_intake_high_water: number
          p_owner_auth_user_id: string
          p_routing_high_water: number
          p_routing_result_id: string
          p_safety_high_water: number
          p_sections: Json
          p_soap_schema_version: string
        }
        Returns: Json
      }
      trusted_record_safety_event: {
        Args: {
          p_assessment_id: string
          p_client_event_id: string
          p_continuation_policy: string
          p_evidence: Json
          p_fired_rule_ids: string[]
          p_intake_high_water: number
          p_owner_auth_user_id: string
          p_payload_id: string
          p_routing_high_water: number
          p_rule_version: string
          p_safety_high_water: number
          p_selected_rule_id: string
          p_severity: string
          p_triggered_at: string
        }
        Returns: Json
      }
      trusted_session_active: {
        Args: { p_auth_user_id: string; p_session_id: string }
        Returns: boolean
      }
      trusted_staff_identity: {
        Args: { p_auth_user_id: string }
        Returns: {
          facility_id: string
          facility_name: string
          staff_profile_id: string
          staff_role: string
        }[]
      }
      trusted_staff_workspace: {
        Args: { p_auth_user_id: string }
        Returns: Json
      }
      trusted_start_assessment: {
        Args: {
          p_assessment_id: string
          p_client_event_id: string
          p_complaint_id: string
          p_complaint_source: string
          p_owner_auth_user_id: string
        }
        Returns: Json
      }
      trusted_transition_canonical_handoff: {
        Args: {
          p_actor_auth_user_id: string
          p_client_event_id: string
          p_handoff_id: string
          p_to_status: string
        }
        Returns: Json
      }
      trusted_transition_handoff: {
        Args: {
          p_actor_auth_user_id: string
          p_client_event_id: string
          p_handoff_id: string
          p_reason_code: string
          p_to_status: string
        }
        Returns: Json
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
