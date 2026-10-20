import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export function validateApiKey(apiKey?: string): string {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Unauthorized [401]: Missing API key. Please provide a valid tenant API key (tk_live_*).'
    );
  }

  const trimmed = apiKey.trim();
  // Ensure token starts with tk_live_ or matches tenant API key convention
  if (!trimmed.startsWith('tk_live_') && !trimmed.startsWith('tk_test_')) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Unauthorized [401]: Invalid API key format. Expected Bearer token starting with "tk_live_*".'
    );
  }

  return trimmed;
}

export function translateHttpError(status: number, message: string): McpError {
  switch (status) {
    case 401:
      return new McpError(
        ErrorCode.InvalidRequest,
        `Unauthorized [401]: ${message || 'Invalid Bearer token or tenant access denied.'}`
      );
    case 403:
      return new McpError(
        ErrorCode.InvalidRequest,
        `Forbidden [403]: ${message || 'Access to requested resource is forbidden.'}`
      );
    case 404:
      return new McpError(
        ErrorCode.InvalidParams,
        `Not Found [404]: ${message || 'The requested project or work item was not found.'}`
      );
    case 400:
    case 422:
      return new McpError(
        ErrorCode.InvalidParams,
        `Bad Request [${status}]: ${message || 'Invalid parameters supplied to Tracker API.'}`
      );
    case 500:
    case 502:
    case 503:
    case 504:
    default:
      return new McpError(
        ErrorCode.InternalError,
        `Server Error [${status}]: ${message || 'SunShade Tracker service encountered an internal error.'}`
      );
  }
}
