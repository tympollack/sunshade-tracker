import { z } from 'zod';

export const HexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const HierarchyLevelSchema = z.object({
  type: z
    .string({ required_error: 'Type is required' })
    .min(1, 'Type cannot be empty'),
  label: z
    .string({ required_error: 'Label is required' })
    .min(1, 'Label cannot be empty'),
  level: z
    .number({ required_error: 'Level is required' })
    .int('Level must be an integer')
    .min(0, 'Level must be >= 0'),
  allowed_parents: z.array(z.string(), {
    required_error: 'allowed_parents must be an array of string types',
  }),
  color: z
    .string()
    .regex(HexColorRegex, 'Invalid hex color (e.g. #38bdf8)')
    .optional(),
});

export const StatusDefinitionSchema = z.object({
  id: z
    .string({ required_error: 'Status ID is required' })
    .min(1, 'Status ID cannot be empty'),
  label: z
    .string({ required_error: 'Status label is required' })
    .min(1, 'Status label cannot be empty'),
  color: z
    .string({ required_error: 'Status color is required' })
    .regex(HexColorRegex, 'Color must be a valid hex string (e.g. #94a3b8)'),
  order: z.number({ required_error: 'Status order is required' }),
  is_completed: z.boolean().optional(),
});

export const CustomFieldSchema = z.union([
  z.string().min(1, 'Field key cannot be empty'),
  z
    .object({
      key: z.string().min(1, 'Field key is required'),
      label: z.string().optional(),
      type: z.enum(['number', 'string', 'enum', 'boolean', 'date']).optional(),
      options: z.array(z.string()).optional(),
      unit: z.string().optional(),
      placeholder: z.string().optional(),
      description: z.string().optional(),
    })
    .passthrough(),
]);

export const WorkMetricConfigSchema = z.object({
  field_key: z.string().min(1, 'field_key is required'),
  label: z.string().optional(),
  unit_label: z.string().optional(),
});

export const ProjectSettingsSchema = z
  .object({
    schema_version: z.string().optional().default('1.0'),
    hierarchy: z
      .array(HierarchyLevelSchema, {
        invalid_type_error: 'hierarchy must be an array of level definitions',
      })
      .min(1, 'hierarchy array cannot be empty')
      .optional(),
    statuses: z
      .array(StatusDefinitionSchema, {
        invalid_type_error: 'statuses must be an array of status definitions',
      })
      .min(1, 'statuses array cannot be empty')
      .optional(),
    custom_fields: z
      .array(CustomFieldSchema, {
        invalid_type_error: 'custom_fields must be an array',
      })
      .nullable()
      .optional()
      .default([]),
    custom_metadata_fields: z.array(z.any()).nullable().optional(),
    work_metric_config: WorkMetricConfigSchema.nullable().optional(),
    work_unit_field: z.string().nullable().optional(),
    sprint_settings: z.record(z.any()).nullable().optional(),
    sprint_metrics: z.record(z.any()).nullable().optional(),
    metric_rules: z.record(z.any()).nullable().optional(),
    github_repo: z.string().nullable().optional(),
    repository_url: z.string().nullable().optional(),
    automations: z.array(z.any()).nullable().optional(),
    templates: z.any().nullable().optional(),
  })
  .passthrough();

export interface SchemaLintError {
  path: string;
  message: string;
}

export function formatZodPath(pathSegments: (string | number)[]): string {
  if (pathSegments.length === 0) return 'settings';
  let formatted = '';
  for (let i = 0; i < pathSegments.length; i++) {
    const seg = pathSegments[i];
    if (typeof seg === 'number') {
      formatted += `[${seg}]`;
    } else {
      if (formatted.length > 0) {
        formatted += '.';
      }
      formatted += seg;
    }
  }
  return formatted;
}

/**
 * Validates a project settings object against ProjectSettingsSchema and
 * cross-field integrity constraints (unique types, allowed_parents references, unique status IDs).
 */
export function lintProjectSettings(settings: unknown): {
  valid: boolean;
  errors: SchemaLintError[];
} {
  if (settings === null || settings === undefined || typeof settings !== 'object') {
    return {
      valid: false,
      errors: [{ path: 'settings', message: 'Project schema settings must be a JSON object' }],
    };
  }

  const result = ProjectSettingsSchema.safeParse(settings);
  if (!result.success) {
    const errors: SchemaLintError[] = result.error.errors.map((err) => ({
      path: formatZodPath(err.path),
      message: err.message,
    }));
    return { valid: false, errors };
  }

  const data = result.data;
  const errors: SchemaLintError[] = [];
  const validHierarchyTypes = new Set((data.hierarchy || []).map((h) => h.type));

  // 1. Check duplicate hierarchy types & allowed_parents validity
  const seenHierarchy = new Set<string>();
  (data.hierarchy || []).forEach((h, idx) => {
    if (seenHierarchy.has(h.type)) {
      errors.push({
        path: `hierarchy[${idx}].type`,
        message: `Duplicate hierarchy type "${h.type}"`,
      });
    }
    seenHierarchy.add(h.type);

    (h.allowed_parents || []).forEach((parentType) => {
      if (parentType !== 'none' && parentType !== '' && !validHierarchyTypes.has(parentType)) {
        errors.push({
          path: `hierarchy[${idx}].allowed_parents`,
          message: `Referenced parent type "${parentType}" does not exist in hierarchy`,
        });
      }
    });
  });

  // 2. Check duplicate status IDs
  const seenStatuses = new Set<string>();
  (data.statuses || []).forEach((s, idx) => {
    if (seenStatuses.has(s.id)) {
      errors.push({
        path: `statuses[${idx}].id`,
        message: `Duplicate status id "${s.id}"`,
      });
    }
    seenStatuses.add(s.id);
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
