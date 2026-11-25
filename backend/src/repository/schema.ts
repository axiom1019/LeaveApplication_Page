/**
 * Sheet definitions. Column order is used when a sheet is first created; afterwards columns are
 * mapped by header name, so reordering columns by hand is harmless. Every cell is stored as text.
 */
export const TABLES = {
  Employees: {
    id: 'employee_id',
    columns: [
      'employee_id', 'email', 'last_name', 'first_name', 'middle_name', 'division_id', 'position', 'salary',
      'employment_type', 'roles', 'signature_file_id', 'is_active', 'created_at', 'updated_at', 'version',
    ],
  },
  Divisions: { id: 'division_id', columns: ['division_id', 'code', 'name', 'chief_employee_id', 'no_chief', 'is_active'] },
  Applications: {
    id: 'application_id',
    columns: [
      'application_id', 'applicant_id', 'filed_on', 'filed_at', 'office', 'division_id', 'last_name', 'first_name', 'middle_name',
      'position', 'salary', 'leave_type', 'leave_type_other', 'details_json', 'dates_json', 'working_days', 'commutation',
      'flow_json', 'current_step', 'status', 'hr_remarks', 'filed_by', 'closed_at', 'cancel_reason', 'pdf_file_id',
      'idempotency_key', 'updated_at', 'version',
    ],
  },
  Signatures: {
    id: 'signature_id',
    columns: [
      'signature_id', 'application_id', 'step_index', 'section', 'signatory', 'signer_id', 'signer_title', 'method',
      'decision', 'data_json', 'signed_at', 'recorded_by', 'withdrawn_at',
    ],
  },
  OicAssignments: {
    id: 'assignment_id',
    columns: ['assignment_id', 'employee_id', 'start_date', 'end_date', 'remarks', 'created_by', 'created_at', 'deleted_at'],
  },
  Holidays: { id: 'date', columns: ['date', 'name'] },
  LeaveCredits: { id: 'employee_id', columns: ['employee_id', 'as_of', 'vl_balance', 'sl_balance', 'updated_by', 'updated_at'] },
  Settings: { id: 'key', columns: ['key', 'value', 'updated_by', 'updated_at'] },
  AuditLog: { id: 'log_id', columns: ['log_id', 'at', 'actor_id', 'actor_email', 'action', 'entity_id', 'detail_json'] },
} as const;

export type TableName = keyof typeof TABLES;
export type ColumnOf<T extends TableName> = (typeof TABLES)[T]['columns'][number];
export type RowOf<T extends TableName> = Record<ColumnOf<T>, string>;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];
