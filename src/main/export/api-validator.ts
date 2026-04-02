// ---------- Types ----------

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, ApiOperation>>;
  servers?: { url: string }[];
  components?: {
    schemas?: Record<string, any>;
  };
}

interface ApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: ApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: any }>;
  };
  responses?: Record<string, {
    description?: string;
    headers?: Record<string, { schema?: any }>;
    content?: Record<string, { schema?: any }>;
  }>;
}

interface ApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: any;
}

export interface ValidationResult {
  matched: boolean;
  operationId?: string;
  path?: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'request' | 'response';
  field: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface ValidationWarning {
  type: 'request' | 'response';
  field: string;
  message: string;
}

// ---------- Helpers ----------

interface MatchedOperation {
  specId: string;
  pathPattern: string;
  operation: ApiOperation;
  pathParams: Record<string, string>;
}

/**
 * Convert an OpenAPI path template like `/users/{id}/posts/{postId}`
 * into a RegExp that captures the named segments.
 */
function pathToRegex(pathTemplate: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = pathTemplate.replace(/\{([^}]+)\}/g, (_match, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

/**
 * Strip the server base path from a URL so we can match against spec paths.
 */
function extractPath(url: string, servers?: { url: string }[]): string {
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname;

    if (servers && servers.length > 0) {
      for (const server of servers) {
        try {
          const serverUrl = new URL(server.url);
          if (pathname.startsWith(serverUrl.pathname) && serverUrl.pathname !== '/') {
            pathname = pathname.slice(serverUrl.pathname.length) || '/';
            break;
          }
        } catch {
          // server.url might be a relative path like /v1
          if (server.url.startsWith('/') && pathname.startsWith(server.url)) {
            pathname = pathname.slice(server.url.length) || '/';
            break;
          }
        }
      }
    }

    return pathname;
  } catch {
    // If URL parsing fails, treat the whole thing as a path
    return url.split('?')[0];
  }
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      if (Array.isArray(value)) return value[0];
      return value;
    }
  }
  return undefined;
}

function parseBody(body: Buffer | string | null): any {
  if (body == null) return undefined;
  const str = typeof body === 'string' ? body : body.toString('utf-8');
  if (str.length === 0) return undefined;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

// ---------- Schema validation ----------

function resolveRef(ref: string, spec: OpenApiSpec): any {
  // Only handle #/components/schemas/Foo style refs
  const match = ref.match(/^#\/components\/schemas\/(.+)$/);
  if (match && spec.components?.schemas?.[match[1]]) {
    return spec.components.schemas[match[1]];
  }
  return null;
}

function resolveSchema(schema: any, spec: OpenApiSpec): any {
  if (!schema) return schema;
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, spec);
    return resolved ?? schema;
  }
  return schema;
}

function validateValueAgainstSchema(
  value: any,
  rawSchema: any,
  spec: OpenApiSpec,
  fieldPath: string,
  errorType: 'request' | 'response',
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const schema = resolveSchema(rawSchema, spec);
  if (!schema) return;

  // Null / undefined – only an error if the field is explicitly required
  // (required-ness is handled by the caller for object properties and parameters)
  if (value === undefined || value === null) {
    return;
  }

  // Enum check
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      errors.push({
        type: errorType,
        field: fieldPath,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        expected: schema.enum.join(' | '),
        actual: String(value),
      });
    }
  }

  // Type check
  if (schema.type) {
    const valid = checkType(value, schema.type);
    if (!valid) {
      errors.push({
        type: errorType,
        field: fieldPath,
        message: `Expected type "${schema.type}" but got "${typeof value}"`,
        expected: schema.type,
        actual: typeof value,
      });
      return; // no point checking deeper if type is wrong
    }
  }

  // Object – validate required properties and each property's schema
  if (schema.type === 'object' || (schema.properties && typeof value === 'object' && !Array.isArray(value))) {
    if (schema.required && Array.isArray(schema.required)) {
      for (const reqProp of schema.required) {
        if (value[reqProp] === undefined || value[reqProp] === null) {
          errors.push({
            type: errorType,
            field: `${fieldPath}.${reqProp}`,
            message: `Missing required property "${reqProp}"`,
          });
        }
      }
    }

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (value[propName] !== undefined) {
          validateValueAgainstSchema(
            value[propName],
            propSchema,
            spec,
            `${fieldPath}.${propName}`,
            errorType,
            errors,
            warnings,
          );
        }
      }
    }

    // Warn about extra properties when additionalProperties is false
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          warnings.push({
            type: errorType,
            field: `${fieldPath}.${key}`,
            message: `Unexpected additional property "${key}"`,
          });
        }
      }
    }
  }

  // Array – validate items schema
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      validateValueAgainstSchema(
        value[i],
        schema.items,
        spec,
        `${fieldPath}[${i}]`,
        errorType,
        errors,
        warnings,
      );
    }
  }
}

function checkType(value: any, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number' && (type === 'number' || Number.isInteger(value));
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true; // unknown type – accept anything
  }
}

// ---------- Main class ----------

export class ApiValidator {
  private specs: Map<string, OpenApiSpec> = new Map();

  addSpec(id: string, spec: OpenApiSpec): void {
    this.specs.set(id, spec);
  }

  removeSpec(id: string): void {
    this.specs.delete(id);
  }

  listSpecs(): { id: string; title: string; version: string }[] {
    const result: { id: string; title: string; version: string }[] = [];
    for (const [id, spec] of this.specs) {
      result.push({ id, title: spec.info.title, version: spec.info.version });
    }
    return result;
  }

  validate(
    request: {
      method: string;
      url: string;
      headers: Record<string, string | string[] | undefined>;
      body: Buffer | string | null;
    },
    response?: {
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
      body: Buffer | string | null;
    },
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Try to find a matching operation across all loaded specs
    const matched = this.findOperation(request.method, request.url);
    if (!matched) {
      return { matched: false, errors: [], warnings: [] };
    }

    const { operation, pathParams, specId, pathPattern } = matched;
    const spec = this.specs.get(specId)!;

    // --- Request validation ---
    this.validateParameters(operation, request, pathParams, spec, errors, warnings);
    this.validateRequestBody(operation, request, spec, errors, warnings);

    // --- Response validation ---
    if (response) {
      this.validateResponse(operation, response, spec, errors, warnings);
    }

    return {
      matched: true,
      operationId: operation.operationId,
      path: pathPattern,
      errors,
      warnings,
    };
  }

  // ---------- Internal ----------

  private findOperation(method: string, url: string): MatchedOperation | null {
    const lowerMethod = method.toLowerCase();

    for (const [specId, spec] of this.specs) {
      const pathname = extractPath(url, spec.servers);

      for (const [pathTemplate, pathItem] of Object.entries(spec.paths)) {
        const operation = pathItem[lowerMethod];
        if (!operation) continue;

        const { regex, paramNames } = pathToRegex(pathTemplate);
        const match = pathname.match(regex);
        if (match) {
          const pathParams: Record<string, string> = {};
          paramNames.forEach((name, i) => {
            pathParams[name] = decodeURIComponent(match[i + 1]);
          });
          return { specId, pathPattern: pathTemplate, operation, pathParams };
        }
      }
    }

    return null;
  }

  private validateParameters(
    operation: ApiOperation,
    request: {
      method: string;
      url: string;
      headers: Record<string, string | string[] | undefined>;
    },
    pathParams: Record<string, string>,
    spec: OpenApiSpec,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (!operation.parameters) return;

    let queryParams: Record<string, string> = {};
    try {
      const parsed = new URL(request.url);
      for (const [k, v] of parsed.searchParams) {
        queryParams[k] = v;
      }
    } catch {
      // ignore
    }

    for (const param of operation.parameters) {
      const resolvedParam = param as ApiParameter; // params shouldn't be $ref in our simple model
      let value: string | undefined;

      switch (resolvedParam.in) {
        case 'path':
          value = pathParams[resolvedParam.name];
          break;
        case 'query':
          value = queryParams[resolvedParam.name];
          break;
        case 'header':
          value = getHeaderValue(request.headers, resolvedParam.name);
          break;
        case 'cookie':
          // Basic cookie extraction
          const cookieHeader = getHeaderValue(request.headers, 'cookie');
          if (cookieHeader) {
            const cookies = cookieHeader.split(';').map((c) => c.trim());
            for (const cookie of cookies) {
              const [name, ...rest] = cookie.split('=');
              if (name.trim() === resolvedParam.name) {
                value = rest.join('=');
                break;
              }
            }
          }
          break;
      }

      if (resolvedParam.required && (value === undefined || value === null)) {
        errors.push({
          type: 'request',
          field: `parameter.${resolvedParam.in}.${resolvedParam.name}`,
          message: `Missing required ${resolvedParam.in} parameter "${resolvedParam.name}"`,
        });
        continue;
      }

      if (value !== undefined && resolvedParam.schema) {
        // Coerce string value to the expected type for validation
        const coerced = coerceValue(value, resolvedParam.schema);
        validateValueAgainstSchema(
          coerced,
          resolvedParam.schema,
          spec,
          `parameter.${resolvedParam.in}.${resolvedParam.name}`,
          'request',
          errors,
          warnings,
        );
      }
    }
  }

  private validateRequestBody(
    operation: ApiOperation,
    request: {
      headers: Record<string, string | string[] | undefined>;
      body: Buffer | string | null;
    },
    spec: OpenApiSpec,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (!operation.requestBody) return;

    const body = parseBody(request.body);
    const hasBody = body !== undefined;

    if (operation.requestBody.required && !hasBody) {
      errors.push({
        type: 'request',
        field: 'body',
        message: 'Request body is required but missing',
      });
      return;
    }

    if (!hasBody || !operation.requestBody.content) return;

    const contentType = getHeaderValue(request.headers, 'content-type') || '';
    const specContentTypes = Object.keys(operation.requestBody.content);

    // Find matching content type (loose match – ignore parameters like charset)
    const baseContentType = contentType.split(';')[0].trim().toLowerCase();
    const matchedContentType = specContentTypes.find((ct) => {
      const baseCt = ct.split(';')[0].trim().toLowerCase();
      // Support wildcard like application/*
      if (baseCt.endsWith('/*')) {
        return baseContentType.startsWith(baseCt.replace('/*', '/'));
      }
      return baseCt === baseContentType;
    });

    if (!matchedContentType) {
      if (specContentTypes.length > 0) {
        errors.push({
          type: 'request',
          field: 'content-type',
          message: `Content-Type "${baseContentType}" does not match any of the expected types`,
          expected: specContentTypes.join(', '),
          actual: baseContentType,
        });
      }
      return;
    }

    const mediaType = operation.requestBody.content[matchedContentType];
    if (mediaType?.schema) {
      validateValueAgainstSchema(body, mediaType.schema, spec, 'body', 'request', errors, warnings);
    }
  }

  private validateResponse(
    operation: ApiOperation,
    response: {
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
      body: Buffer | string | null;
    },
    spec: OpenApiSpec,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (!operation.responses) {
      warnings.push({
        type: 'response',
        field: 'responses',
        message: 'No responses defined in the spec for this operation',
      });
      return;
    }

    const statusStr = String(response.statusCode);
    // Try exact status, then wildcard (2XX, 3XX, etc.), then default
    const responseDef =
      operation.responses[statusStr] ||
      operation.responses[`${statusStr[0]}XX`] ||
      operation.responses[`${statusStr[0]}xx`] ||
      operation.responses['default'];

    if (!responseDef) {
      errors.push({
        type: 'response',
        field: 'statusCode',
        message: `Status code ${response.statusCode} is not defined in the spec`,
        expected: Object.keys(operation.responses).join(', '),
        actual: statusStr,
      });
      return;
    }

    // Validate response headers
    if (responseDef.headers) {
      for (const [headerName, headerDef] of Object.entries(responseDef.headers)) {
        const headerValue = getHeaderValue(response.headers, headerName);
        if (headerValue === undefined) {
          warnings.push({
            type: 'response',
            field: `header.${headerName}`,
            message: `Expected response header "${headerName}" is missing`,
          });
        } else if (headerDef.schema) {
          const coerced = coerceValue(headerValue, headerDef.schema);
          validateValueAgainstSchema(
            coerced,
            headerDef.schema,
            spec,
            `header.${headerName}`,
            'response',
            errors,
            warnings,
          );
        }
      }
    }

    // Validate response body
    if (responseDef.content) {
      const body = parseBody(response.body);
      if (body === undefined) {
        warnings.push({
          type: 'response',
          field: 'body',
          message: 'Response body is empty but spec defines content',
        });
        return;
      }

      const contentType = getHeaderValue(response.headers, 'content-type') || '';
      const baseContentType = contentType.split(';')[0].trim().toLowerCase();
      const specContentTypes = Object.keys(responseDef.content);

      const matchedContentType = specContentTypes.find((ct) => {
        const baseCt = ct.split(';')[0].trim().toLowerCase();
        if (baseCt.endsWith('/*')) {
          return baseContentType.startsWith(baseCt.replace('/*', '/'));
        }
        return baseCt === baseContentType;
      });

      if (!matchedContentType) {
        if (specContentTypes.length > 0) {
          warnings.push({
            type: 'response',
            field: 'content-type',
            message: `Response Content-Type "${baseContentType}" does not match spec types: ${specContentTypes.join(', ')}`,
          });
        }
        return;
      }

      const mediaType = responseDef.content[matchedContentType];
      if (mediaType?.schema) {
        validateValueAgainstSchema(body, mediaType.schema, spec, 'body', 'response', errors, warnings);
      }
    }
  }
}

/**
 * Coerce a string value (from headers, query params, path params) to the
 * type indicated by the schema so that type-checking works correctly.
 */
function coerceValue(value: string, schema: any): any {
  if (!schema || !schema.type) return value;
  switch (schema.type) {
    case 'integer': {
      const n = parseInt(value, 10);
      return isNaN(n) ? value : n;
    }
    case 'number': {
      const n = parseFloat(value);
      return isNaN(n) ? value : n;
    }
    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    default:
      return value;
  }
}
