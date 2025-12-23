import React, { useState } from 'react';
import { TrafficList } from './TrafficList';
import { TrafficDetail } from './TrafficDetail';
import { TrafficFilters } from './TrafficFilters';
import { useTrafficStore } from '../../stores/trafficStore';

export const TrafficView: React.FC = () => {
  const selectedEntry = useTrafficStore((state) => state.getSelectedEntry());
  const [detailWidth, setDetailWidth] = useState(500);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 64; // 64 = sidebar width
      setDetailWidth(Math.max(300, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <TrafficFilters />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Traffic list */}
        <div className="flex-1 overflow-hidden">
          <TrafficList />
        </div>

        {/* Resize handle & Detail panel */}
        {selectedEntry && (
          <>
            <div
              className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize transition-colors"
              onMouseDown={handleMouseDown}
            />
            <div style={{ width: detailWidth }} className="overflow-hidden">
              <TrafficDetail entry={selectedEntry} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
