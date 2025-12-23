import React from 'react';
import type { TrafficEntry } from '../../../shared/types';

interface TrafficItemProps {
  entry: TrafficEntry;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent, entry: TrafficEntry) => void;
}

const methodColors: Record<string, string> = {
  GET: 'text-green-600',
  POST: 'text-blue-600',
  PUT: 'text-yellow-600',
  PATCH: 'text-orange-600',
  DELETE: 'text-red-600',
  OPTIONS: 'text-purple-600',
  HEAD: 'text-cyan-600',
};

const statusColors: Record<string, string> = {
  '1': 'text-blue-500',
  '2': 'text-green-600',
  '3': 'text-yellow-600',
  '4': 'text-orange-600',
  '5': 'text-red-600',
};

const statusBgColors: Record<string, string> = {
  pending: 'bg-gray-100',
  active: 'bg-blue-50',
  complete: '',
  error: 'bg-red-50',
  blocked: 'bg-orange-50',
  mocked: 'bg-purple-50',
};

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function getContentType(headers: Record<string, string | string[] | undefined>): string {
  const ct = headers['content-type'];
  if (!ct) return '-';
  const type = String(ct).split(';')[0].trim();
  // Simplify common types
  if (type.includes('json')) return 'JSON';
  if (type.includes('html')) return 'HTML';
  if (type.includes('xml')) return 'XML';
  if (type.includes('javascript')) return 'JS';
  if (type.includes('css')) return 'CSS';
  if (type.includes('image')) return 'Image';
  if (type.includes('font')) return 'Font';
  if (type.includes('text')) return 'Text';
  return type.split('/')[1] || type;
}

export const TrafficItem: React.FC<TrafficItemProps> = ({
  entry,
  isSelected,
  onClick,
  onContextMenu,
}) => {
  const { request, response, status, timing } = entry;

  let url: URL | null = null;
  try {
    url = new URL(request.url);
  } catch {
    // Invalid URL
  }

  const statusCode = response?.statusCode;
  const statusGroup = statusCode ? String(statusCode)[0] : '';
  const duration = timing?.total;
  const size = response?.body
    ? typeof response.body === 'string'
      ? response.body.length
      : response.body.length
    : undefined;

  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, entry)}
      className={`
        flex items-center h-9 px-2 cursor-pointer text-sm border-b border-gray-100
        ${isSelected ? 'bg-blue-100' : statusBgColors[status] || 'hover:bg-gray-50'}
      `}
    >
      {/* Method */}
      <div className={`w-16 shrink-0 font-mono font-medium ${methodColors[request.method] || 'text-gray-600'}`}>
        {request.method}
      </div>

      {/* Status */}
      <div className="w-14 shrink-0">
        {status === 'pending' || status === 'active' ? (
          <span className="inline-flex items-center">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          </span>
        ) : status === 'error' ? (
          <span className="text-red-500 font-medium">ERR</span>
        ) : status === 'blocked' ? (
          <span className="text-orange-500 font-medium">BLK</span>
        ) : status === 'mocked' ? (
          <span className="text-purple-500 font-medium">{statusCode || 'MCK'}</span>
        ) : statusCode ? (
          <span className={`font-medium ${statusColors[statusGroup] || 'text-gray-600'}`}>
            {statusCode}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </div>

      {/* URL */}
      <div className="flex-1 min-w-0 truncate font-mono text-gray-700">
        {url ? (
          <>
            <span className="text-gray-400">{url.host}</span>
            <span>{url.pathname}{url.search}</span>
          </>
        ) : (
          request.url
        )}
      </div>

      {/* Content Type */}
      <div className="w-24 shrink-0 text-right text-gray-500">
        {response ? getContentType(response.headers) : '-'}
      </div>

      {/* Duration */}
      <div className="w-20 shrink-0 text-right text-gray-500 font-mono">
        {formatDuration(duration)}
      </div>

      {/* Size */}
      <div className="w-20 shrink-0 text-right text-gray-500 font-mono">
        {formatSize(size)}
      </div>
    </div>
  );
};
