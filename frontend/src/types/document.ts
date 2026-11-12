export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "finalized"
  | "cancelled";

export type PipelineStage =
  | "job_started"
  | "document_received"
  | "document_parsing_started"
  | "document_parsing_completed"
  | "ai_analysis_started"
  | "field_extraction_started"
  | "field_extraction_completed"
  | "validation_completed"
  | "storing_result"
  | "job_completed"
  | "job_failed"
  | "ai_retrying";

export type AIProviderName = "gemini" | "groq";

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface AIConnection {
  id: string;
  provider: AIProviderName | string;
  label?: string | null;
  masked_api_key: string;
  key_last_four: string;
  model: string;
  is_active: boolean;
  is_default: boolean;
  connection_status: "untested" | "connected" | "invalid" | "error" | string;
  last_tested_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIConnectionCreatePayload {
  provider: AIProviderName;
  api_key: string;
  model: string;
  label?: string;
  is_active?: boolean;
  is_default?: boolean;
  test_before_save?: boolean;
}

export interface AIConnectionUpdatePayload {
  api_key?: string;
  model?: string;
  label?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface AIConnectionTestPayload {
  connection_id?: string;
  provider?: AIProviderName;
  api_key?: string;
  model?: string;
}

export interface AIConnectionTestResponse {
  valid: boolean;
  status: string;
  message: string;
  provider: string;
  model?: string | null;
  error_category?: string | null;
  usage_info?: Record<string, unknown>;
  connection?: AIConnection | null;
}

export interface AIModelInfo {
  id: string;
  display_name: string;
  provider: string;
  context_window?: number | null;
  supports_structured_output: boolean;
  description: string;
}

export interface AIUsageLog {
  id: string;
  connection_id?: string | null;
  document_id?: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  processing_duration: number;
  status: string;
  error_category?: string | null;
  created_at: string;
}

export interface AIUsageProviderSummary {
  provider: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  avg_duration_seconds: number;
}

export interface AIUsageResponse {
  totals: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    avg_duration_seconds: number;
  };
  by_provider: AIUsageProviderSummary[];
  recent_logs: AIUsageLog[];
}

export type ValidationStatus = "valid" | "warning" | "invalid" | "missing" | "unverified";

export interface ExtractedField<T = unknown> {
  value: T | null;
  confidence: number;
  evidence?: string | null;
  validation_status: ValidationStatus;
  validation_note?: string | null;
  verified_by_human?: boolean;
}

export interface InvoiceLineItem {
  description?: string | null;
  hsn_sac_code?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  confidence: number;
  evidence?: string | null;
  validation_status: ValidationStatus;
  validation_note?: string | null;
  verified_by_human?: boolean;
}

export interface GSTDetails {
  vendor_gstin: ExtractedField<string>;
  customer_gstin: ExtractedField<string>;
  taxable_value: ExtractedField<number>;
  cgst: ExtractedField<number>;
  sgst: ExtractedField<number>;
  igst: ExtractedField<number>;
  place_of_supply: ExtractedField<string>;
}

export interface InvoiceExtractionPayload {
  document_classification: string;
  summary: string;
  invoice_number: ExtractedField<string>;
  invoice_date: ExtractedField<string>;
  due_date: ExtractedField<string>;
  vendor_name: ExtractedField<string>;
  vendor_address: ExtractedField<string>;
  customer_name: ExtractedField<string>;
  customer_address: ExtractedField<string>;
  currency: ExtractedField<string>;
  subtotal: ExtractedField<number>;
  tax_amount: ExtractedField<number>;
  total_amount: ExtractedField<number>;
  payment_terms: ExtractedField<string>;
  purchase_order_reference: ExtractedField<string>;
  gst: GSTDetails;
  line_items: InvoiceLineItem[];
  overall_confidence: number;
}

export interface ValidationCheck {
  code: string;
  label: string;
  status: "passed" | "warning" | "failed" | "skipped";
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface DuplicateMatch {
  document_id: string;
  original_filename: string;
  invoice_number?: string | null;
  vendor_name?: string | null;
  status: string;
}

export interface DeterministicValidationReport {
  overall_status: "valid" | "needs_review" | "invalid";
  checks: ValidationCheck[];
  duplicate_matches: DuplicateMatch[];
  computed_line_items_sum?: number | null;
  computed_tax_sum?: number | null;
  computed_total?: number | null;
  missing_mandatory_fields: string[];
}

export interface DocumentItem {
  id: string;
  user_id?: string | null;
  filename: string;
  original_filename: string;
  file_size: number;
  file_type: string;
  mime_type?: string;
  document_type?: string;
  batch_id?: string | null;
  ai_connection_id?: string | null;
  ai_provider?: string | null;
  ai_model?: string | null;
  invoice_number?: string | null;
  vendor_name?: string | null;
  status: JobStatus;
  celery_task_id?: string | null;
  progress: number;
  current_stage?: PipelineStage | string | null;
  error_message?: string | null;
  retry_count: number;
  extracted_data?: Record<string, unknown> | null;
  reviewed_data?: Record<string, unknown> | null;
  is_reviewed: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  is_synthetic?: boolean;
}

export interface DocumentListResponse {
  items: DocumentItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProgressEvent {
  job_id: string;
  event: string;
  progress: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface Stats {
  [key: string]: number | undefined;
  queued?: number;
  processing?: number;
  completed?: number;
  failed?: number;
  finalized?: number;
}

export interface ListDocumentsParams {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
  batch_id?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc" | string;
}

export type AppMode = "demo" | "live";
export type BackendHealth = "healthy" | "sleeping" | "offline" | "checking";
