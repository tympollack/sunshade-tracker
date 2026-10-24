import { lintProjectSettings } from './project-settings-schema';
import { validateProjectSettings as validateWithErrors } from './project-settings-validator';
export * from '@/types/tracker';

/**
 * Runtime schema validator for project settings.
 * Validates hierarchy, statuses, custom fields, automations, and templates.
 * Returns true if the settings payload is valid, false otherwise.
 */
export function validateProjectSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return false;
  }

  // 1. Cross-field linting & zod schema validation
  const lintResult = lintProjectSettings(settings);
  if (!lintResult.valid) {
    return false;
  }

  // 2. Deep settings, metrics, automations & templates validation
  const valResult = validateWithErrors(settings);
  if (!valResult.valid) {
    return false;
  }

  return true;
}
