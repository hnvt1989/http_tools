import React from 'react';
import { useTrafficStore } from '../../stores/trafficStore';

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const statusCodes = ['2xx', '3xx', '4xx', '5xx'];

export const TrafficFilters: React.FC = () => {
  const { filter, setFilter, clearFilter } = useTrafficStore();
  const hasFilters = Object.keys(filter).some(
    (k) => filter[k as keyof typeof filter] !== undefined
  );

  const toggleMethod = (method: string) => {
    const current = filter.methods || [];
    if (current.includes(method)) {
      setFilter({ methods: current.filter((m) => m !== method) });
    } else {
      setFilter({ methods: [...current, method] });
    }
  };

  const toggleStatus = (status: string) => {
    const current = filter.statusCodes || [];
    if (current.includes(status)) {
      setFilter({ statusCodes: current.filter((s) => s !== status) });
    } else {
      setFilter({ statusCodes: [...current, status] });
    }
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 bg-white">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Filter by URL..."
          value={filter.search || ''}
          onChange={(e) => setFilter({ search: e.target.value || undefined })}
          className="w-full pl-10 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Method filters */}
      <div className="flex items-center gap-1">
        {methods.map((method) => (
          <button
            key={method}
            onClick={() => toggleMethod(method)}
            className={`
              px-2 py-1 text-xs font-medium rounded transition-colors
              ${
                filter.methods?.includes(method)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {method}
          </button>
        ))}
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-1">
        {statusCodes.map((status) => (
          <button
            key={status}
            onClick={() => toggleStatus(status)}
            className={`
              px-2 py-1 text-xs font-medium rounded transition-colors
              ${
                filter.statusCodes?.includes(status)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Special filters */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filter.showOnlyErrors || false}
            onChange={(e) =>
              setFilter({ showOnlyErrors: e.target.checked || undefined })
            }
            className="rounded text-blue-500 focus:ring-blue-500"
          />
          Errors only
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filter.showOnlyMocked || false}
            onChange={(e) =>
              setFilter({ showOnlyMocked: e.target.checked || undefined })
            }
            className="rounded text-blue-500 focus:ring-blue-500"
          />
          Mocked only
        </label>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={clearFilter}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};
