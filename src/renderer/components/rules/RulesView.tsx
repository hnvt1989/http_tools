import React, { useEffect, useState } from 'react';
import { useRulesStore } from '../../stores/rulesStore';
import { RuleEditor } from './RuleEditor';
import type { Rule, RuleType } from '../../../shared/types';

export const RulesView: React.FC = () => {
  const { rules, isLoading, loadRules, deleteRule, toggleRule, selectRule, selectedId } = useRulesStore();
  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [initialType, setInitialType] = useState<RuleType>('mock');

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreateRule = (type: RuleType) => {
    setInitialType(type);
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleEditRule = (rule: Rule) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingRule(null);
  };

  const ruleTypeColors: Record<RuleType, string> = {
    mock: 'bg-purple-100 text-purple-700',
    rewrite: 'bg-blue-100 text-blue-700',
    breakpoint: 'bg-yellow-100 text-yellow-700',
    block: 'bg-red-100 text-red-700',
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Rules</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCreateRule('mock')}
            className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            + Mock
          </button>
          <button
            onClick={() => handleCreateRule('rewrite')}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            + Rewrite
          </button>
          <button
            onClick={() => handleCreateRule('breakpoint')}
            className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors"
          >
            + Breakpoint
          </button>
          <button
            onClick={() => handleCreateRule('block')}
            className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            + Block
          </button>
        </div>
      </div>

      {/* Rules list */}
      <div className="flex-1 overflow-auto">
        {rules.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <p className="text-lg font-medium">No rules defined</p>
            <p className="text-sm mt-1">Create a rule to mock or modify requests</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                  selectedId === rule.id ? 'bg-blue-50' : ''
                }`}
                onClick={() => selectRule(rule.id)}
              >
                {/* Enable toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRule(rule.id);
                  }}
                  className={`w-10 h-6 rounded-full transition-colors ${
                    rule.enabled ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      rule.enabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>

                {/* Type badge */}
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${ruleTypeColors[rule.type]}`}
                >
                  {rule.type}
                </span>

                {/* Rule info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{rule.name}</p>
                  <p className="text-sm text-gray-500 font-mono truncate">
                    {rule.matcher.urlPattern}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditRule(rule);
                    }}
                    className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                    title="Edit"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this rule?')) {
                        deleteRule(rule.id);
                      }
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal */}
      {showEditor && (
        <RuleEditor rule={editingRule} initialType={initialType} onClose={handleCloseEditor} />
      )}
    </div>
  );
};
