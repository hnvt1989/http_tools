import { describe, it, expect, beforeEach } from 'vitest';
import { ApiValidator } from '../src/main/export/api-validator';

function makeSpec() {
  return {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/users': {
        get: {
          operationId: 'listUsers',
          summary: 'List users',
          parameters: [
            {
              name: 'page',
              in: 'query' as const,
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'limit',
              in: 'query' as const,
              required: false,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      users: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer' },
                            name: { type: 'string' },
                          },
                          required: ['id', 'name'],
                        },
                      },
                      total: { type: 'integer' },
                    },
                    required: ['users', 'total'],
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createUser',
          summary: 'Create a user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                    age: { type: 'integer' },
                  },
                  required: ['name', 'email'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Bad Request',
            },
          },
        },
      },
      '/users/{id}': {
        get: {
          operationId: 'getUser',
          summary: 'Get a user by ID',
          parameters: [
            {
              name: 'id',
              in: 'path' as const,
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Not found',
            },
          },
        },
      },
    },
  };
}

describe('ApiValidator', () => {
  let validator: ApiValidator;

  beforeEach(() => {
    validator = new ApiValidator();
  });

  describe('addSpec and listSpecs', () => {
    it('should add and list specs', () => {
      validator.addSpec('test-api', makeSpec());

      const specs = validator.listSpecs();
      expect(specs).toHaveLength(1);
      expect(specs[0].id).toBe('test-api');
      expect(specs[0].title).toBe('Test API');
      expect(specs[0].version).toBe('1.0.0');
    });

    it('should handle multiple specs', () => {
      validator.addSpec('api-1', makeSpec());
      const spec2 = makeSpec();
      spec2.info.title = 'Another API';
      spec2.info.version = '2.0.0';
      validator.addSpec('api-2', spec2);

      const specs = validator.listSpecs();
      expect(specs).toHaveLength(2);
    });

    it('should allow removing specs', () => {
      validator.addSpec('test-api', makeSpec());
      validator.removeSpec('test-api');

      const specs = validator.listSpecs();
      expect(specs).toHaveLength(0);
    });
  });

  describe('path matching with path parameters', () => {
    it('should match /users/{id} with /users/42', () => {
      validator.addSpec('test', makeSpec());

      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users/42',
          headers: {},
          body: null,
        },
        {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: '{"id":42,"name":"Alice","email":"a@b.com"}',
        },
      );

      expect(result.matched).toBe(true);
      expect(result.operationId).toBe('getUser');
      expect(result.path).toBe('/users/{id}');
    });

    it('should match /users exactly', () => {
      validator.addSpec('test', makeSpec());

      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          headers: {},
          body: null,
        },
      );

      expect(result.matched).toBe(true);
      expect(result.operationId).toBe('listUsers');
    });
  });

  describe('request validation', () => {
    beforeEach(() => {
      validator.addSpec('test', makeSpec());
    });

    it('should report missing required query parameter', () => {
      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: {},
          body: null,
        },
      );

      expect(result.matched).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      const paramError = result.errors.find(e =>
        e.field.includes('page') && e.type === 'request'
      );
      expect(paramError).toBeDefined();
      expect(paramError!.message).toContain('Missing required');
    });

    it('should pass with valid required query parameter', () => {
      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          headers: {},
          body: null,
        },
      );

      expect(result.matched).toBe(true);
      const paramErrors = result.errors.filter(e =>
        e.field.includes('page')
      );
      expect(paramErrors).toHaveLength(0);
    });

    it('should report wrong request body type', () => {
      const result = validator.validate(
        {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'content-type': 'application/json' },
          body: '{"name": 123, "email": "a@b.com"}',
        },
      );

      expect(result.matched).toBe(true);
      const typeError = result.errors.find(e =>
        e.field.includes('name') && e.message.includes('type')
      );
      expect(typeError).toBeDefined();
    });

    it('should report missing required body properties', () => {
      const result = validator.validate(
        {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'content-type': 'application/json' },
          body: '{"name": "Alice"}',
        },
      );

      expect(result.matched).toBe(true);
      const missingEmail = result.errors.find(e =>
        e.field.includes('email') && e.message.includes('required')
      );
      expect(missingEmail).toBeDefined();
    });

    it('should pass with valid request body', () => {
      const result = validator.validate(
        {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'content-type': 'application/json' },
          body: '{"name": "Alice", "email": "alice@example.com"}',
        },
      );

      expect(result.matched).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required request body', () => {
      const result = validator.validate(
        {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'content-type': 'application/json' },
          body: null,
        },
      );

      expect(result.matched).toBe(true);
      const bodyError = result.errors.find(e =>
        e.field === 'body' && e.message.includes('required')
      );
      expect(bodyError).toBeDefined();
    });

    it('should report wrong content-type', () => {
      const result = validator.validate(
        {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'content-type': 'text/plain' },
          body: 'name=Alice',
        },
      );

      expect(result.matched).toBe(true);
      const ctError = result.errors.find(e =>
        e.field === 'content-type'
      );
      expect(ctError).toBeDefined();
    });
  });

  describe('response validation', () => {
    beforeEach(() => {
      validator.addSpec('test', makeSpec());
    });

    it('should report unexpected status code', () => {
      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          headers: {},
          body: null,
        },
        {
          statusCode: 500,
          headers: { 'content-type': 'application/json' },
          body: '{"error":"internal"}',
        },
      );

      expect(result.matched).toBe(true);
      const statusError = result.errors.find(e =>
        e.field === 'statusCode' && e.type === 'response'
      );
      expect(statusError).toBeDefined();
      expect(statusError!.message).toContain('500');
    });

    it('should pass with valid response status and body', () => {
      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          headers: {},
          body: null,
        },
        {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: '{"users":[{"id":1,"name":"Alice"}],"total":1}',
        },
      );

      expect(result.matched).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required response properties', () => {
      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          headers: {},
          body: null,
        },
        {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: '{"users":[]}',
        },
      );

      expect(result.matched).toBe(true);
      const totalError = result.errors.find(e =>
        e.field.includes('total') && e.type === 'response'
      );
      expect(totalError).toBeDefined();
    });

    it('should accept a defined status code like 400', () => {
      const result = validator.validate(
        {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'content-type': 'application/json' },
          body: '{"name":"Alice","email":"a@b.com"}',
        },
        {
          statusCode: 400,
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );

      expect(result.matched).toBe(true);
      const statusError = result.errors.find(e =>
        e.field === 'statusCode'
      );
      expect(statusError).toBeUndefined();
    });
  });

  describe('unmatched requests', () => {
    it('should return matched: false for unknown paths', () => {
      validator.addSpec('test', makeSpec());

      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/nonexistent',
          headers: {},
          body: null,
        },
      );

      expect(result.matched).toBe(false);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return matched: false for wrong method on valid path', () => {
      validator.addSpec('test', makeSpec());

      const result = validator.validate(
        {
          method: 'DELETE',
          url: 'https://api.example.com/users',
          headers: {},
          body: null,
        },
      );

      expect(result.matched).toBe(false);
    });

    it('should return matched: false when no specs are loaded', () => {
      const result = validator.validate(
        {
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          headers: {},
          body: null,
        },
      );

      expect(result.matched).toBe(false);
    });
  });
});
