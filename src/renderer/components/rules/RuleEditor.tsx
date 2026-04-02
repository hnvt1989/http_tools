import React, { useState } from 'react';
import { useRulesStore } from '../../stores/rulesStore';
import type { Rule, RuleType, MockRule, RewriteRule, BlockRule, BreakpointRule } from '../../../shared/types';

interface RuleEditorProps {
  rule: Rule | null;
  initialType?: RuleType;
  onClose: () => void;
}

export const RuleEditor: React.FC<RuleEditorProps> = ({ rule, initialType = 'mock', onClose }) => {
  const { addRule, updateRule } = useRulesStore();
  const [isSaving, setIsSaving] = useState(false);

  const [type, setType] = useState<RuleType>(rule?.type || initialType);
  const [name, setName] = useState(rule?.name || '');
  const [urlPattern, setUrlPattern] = useState(rule?.matcher.urlPattern || '*');
  const [methods, setMethods] = useState<string[]>(rule?.matcher.methods || []);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);

  // Mock specific
  const [statusCode, setStatusCode] = useState(
    rule?.type === 'mock' ? (rule as MockRule).response.statusCode : 200
  );
  const [responseBody, setResponseBody] = useState(
    rule?.type === 'mock' ? (rule as MockRule).response.body : ''
  );
  const [responseHeaders, setResponseHeaders] = useState(
    rule?.type === 'mock'
      ? JSON.stringify((rule as MockRule).response.headers, null, 2)
      : '{\n  "Content-Type": "application/json"\n}'
  );
  const [delay, setDelay] = useState(
    rule?.type === 'mock' ? (rule as MockRule).response.delay || 0 : 0
  );

  // Rewrite specific
  const [rewriteUrl, setRewriteUrl] = useState(
    rule?.type === 'rewrite' ? (rule as RewriteRule).modifications.request?.url || '' : ''
  );

  // Block specific
  const [blockCode, setBlockCode] = useState(
    rule?.type === 'block' ? (rule as BlockRule).errorCode || 403 : 403
  );
  const [blockMessage, setBlockMessage] = useState(
    rule?.type === 'block' ? (rule as BlockRule).errorMessage || 'Blocked' : 'Blocked'
  );

  // Breakpoint specific
  const [breakOn, setBreakOn] = useState<'request' | 'response' | 'both'>(
    rule?.type === 'breakpoint' ? (rule as BreakpointRule).breakOn : 'request'
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(responseHeaders);
      } catch {
        // Invalid JSON, use empty headers
      }

      const baseRule = {
        name: name || `${type} rule`,
        type,
        enabled,
        priority: rule?.priority || 100,
        matcher: {
          urlPattern,
          methods: methods.length > 0 ? methods : undefined,
        },
      };

      let fullRule: any;

      if (type === 'mock') {
        fullRule = {
          ...baseRule,
          response: {
            statusCode,
            headers,
            body: responseBody,
            delay: delay > 0 ? delay : undefined,
          },
        };
      } else if (type === 'rewrite') {
        fullRule = {
          ...baseRule,
          modifications: {
            request: rewriteUrl ? { url: rewriteUrl } : undefined,
          },
        };
      } else if (type === 'block') {
        fullRule = {
          ...baseRule,
          errorCode: blockCode,
          errorMessage: blockMessage,
        };
      } else if (type === 'breakpoint') {
        fullRule = {
          ...baseRule,
          breakOn,
        };
      } else {
        fullRule = baseRule;
      }

      if (rule) {
        await updateRule({ ...rule, ...fullRule });
      } else {
        await addRule(fullRule);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save rule:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMethod = (method: string) => {
    if (methods.includes(method)) {
      setMethods(methods.filter((m) => m !== method));
    } else {
      setMethods([...methods, method]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">
            {rule ? 'Edit Rule' : 'Create Rule'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-4">
            {/* Rule Type */}
            {!rule && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <div className="flex gap-2">
                  {(['mock', 'rewrite', 'breakpoint', 'block'] as RuleType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`px-4 py-2 text-sm font-medium rounded transition-colors capitalize ${
                        type === t
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rule name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* URL Pattern */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Pattern</label>
              <input
                type="text"
                value={urlPattern}
                onChange={(e) => setUrlPattern(e.target.value)}
                placeholder="*api/* or /regex/ or exact URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use * for glob patterns, /regex/ for regex, or exact URL
              </p>
            </div>

            {/* Methods */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Methods (optional)</label>
              <div className="flex gap-2 flex-wrap">
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                  <button
                    key={method}
                    onClick={() => toggleMethod(method)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      methods.includes(method)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Type-specific fields */}
            {type === 'mock' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status Code</label>
                  <input
                    type="number"
                    value={statusCode}
                    onChange={(e) => setStatusCode(parseInt(e.target.value) || 200)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Response Headers (JSON)</label>
                  <textarea
                    value={responseHeaders}
                    onChange={(e) => setResponseHeaders(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Response Body</label>
                  <textarea
                    value={responseBody}
                    onChange={(e) => setResponseBody(e.target.value)}
                    rows={6}
                    placeholder='{"message": "mocked response"}'
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delay (ms)</label>
                  <input
                    type="number"
                    value={delay}
                    onChange={(e) => setDelay(parseInt(e.target.value) || 0)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {type === 'rewrite' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rewrite URL to</label>
                <input
                  type="text"
                  value={rewriteUrl}
                  onChange={(e) => setRewriteUrl(e.target.value)}
                  placeholder="https://new-host.com/api"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {type === 'block' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Error Code</label>
                  <input
                    type="number"
                    value={blockCode}
                    onChange={(e) => setBlockCode(parseInt(e.target.value) || 403)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Error Message</label>
                  <input
                    type="text"
                    value={blockMessage}
                    onChange={(e) => setBlockMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {type === 'breakpoint' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Break On</label>
                <div className="flex gap-2">
                  {(['request', 'response', 'both'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setBreakOn(opt)}
                      className={`px-3 py-1.5 text-sm rounded transition-colors capitalize ${
                        breakOn === opt
                          ? 'bg-yellow-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Enabled */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="enabled" className="text-sm text-gray-700">
                Enable rule
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !urlPattern}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};
