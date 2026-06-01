'use client';
import { useCallback, useState } from 'react';
import ReactFlow, {
  Node, Edge, Controls, Background, MiniMap,
  useNodesState, useEdgesState, addEdge, Connection,
  Handle, Position, NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Calendar, IndianRupee, AlertTriangle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Milestone {
  id: string;
  label: string;
  date: string;
  durationDays: number;
  tasks: string;
  estimatedCost: number;
  weatherRequirement: string;
  status?: 'pending' | 'active' | 'done' | 'alert';
}

interface MilestoneNodeData {
  milestone: Milestone;
  onClick: (m: Milestone) => void;
}

function MilestoneNode({ data }: NodeProps<MilestoneNodeData>) {
  const { milestone: m, onClick } = data;
  const colorMap = {
    pending: 'border-gray-300 bg-white',
    active: 'border-brand-500 bg-brand-50',
    done: 'border-green-500 bg-green-50',
    alert: 'border-red-400 bg-red-50',
  };
  const status = m.status ?? 'pending';

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <button onClick={() => onClick(m)}
        className={`border-2 rounded-xl p-3 min-w-[160px] max-w-[200px] text-left transition-shadow hover:shadow-md ${colorMap[status]}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm text-gray-800">{m.label}</span>
          {status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
          {status === 'alert' && <AlertTriangle className="w-4 h-4 text-red-500" />}
          {status === 'active' && <Circle className="w-4 h-4 text-brand-500 fill-brand-500" />}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
          <Calendar className="w-3 h-3" />{formatDate(m.date)}
        </div>
        {m.estimatedCost > 0 && (
          <div className="flex items-center gap-1 text-xs text-earth-600">
            <IndianRupee className="w-3 h-3" />₹{m.estimatedCost.toLocaleString('en-IN')}
          </div>
        )}
      </button>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

const nodeTypes = { milestone: MilestoneNode };

interface PlanFlowChartProps {
  milestones: Milestone[];
  cropName: string;
  totalBudget: number;
  harvestDate: string;
  sellWindow: string;
}

export default function PlanFlowChart({ milestones, cropName, totalBudget, harvestDate, sellWindow }: PlanFlowChartProps) {
  const [selected, setSelected] = useState<Milestone | null>(null);

  const initialNodes: Node[] = milestones.map((m, i) => ({
    id: m.id,
    type: 'milestone',
    position: { x: i * 240, y: 80 },
    data: { milestone: m, onClick: setSelected },
  }));

  const initialEdges: Edge[] = milestones.slice(0, -1).map((m, i) => ({
    id: `e-${m.id}`,
    source: m.id,
    target: milestones[i + 1].id,
    animated: m.status === 'active',
    style: { stroke: '#16a34a', strokeWidth: 2 },
  }));

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <span className="bg-brand-100 text-brand-700 px-3 py-1.5 rounded-full font-medium">🌾 {cropName}</span>
        <span className="bg-earth-100 text-earth-700 px-3 py-1.5 rounded-full flex items-center gap-1">
          <IndianRupee className="w-3.5 h-3.5" />Total Budget: ₹{totalBudget.toLocaleString('en-IN')}
        </span>
        <span className="bg-sky-100 text-sky-700 px-3 py-1.5 rounded-full flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />Harvest: {formatDate(harvestDate)}
        </span>
        <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full">Sell window: {sellWindow}</span>
      </div>

      <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ height: 320 }}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }}>
          <Controls />
          <Background color="#f0fdf4" gap={20} />
          <MiniMap nodeColor={n => {
            const s = (n.data as MilestoneNodeData).milestone.status ?? 'pending';
            return s === 'done' ? '#22c55e' : s === 'alert' ? '#ef4444' : s === 'active' ? '#16a34a' : '#d1d5db';
          }} />
        </ReactFlow>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-1">{selected.label}</h3>
            <p className="text-sm text-gray-500 mb-4 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />{formatDate(selected.date)} · {selected.durationDays} days
            </p>
            <div className="space-y-3 text-sm">
              <div><p className="font-medium text-gray-600 mb-1">Tasks</p><p className="text-gray-700 whitespace-pre-wrap">{selected.tasks}</p></div>
              {selected.estimatedCost > 0 && (
                <div className="flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-earth-600" />
                  <span className="text-earth-700 font-medium">Estimated Cost: ₹{selected.estimatedCost.toLocaleString('en-IN')}</span>
                </div>
              )}
              {selected.weatherRequirement && (
                <div className="bg-sky-50 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sky-700">{selected.weatherRequirement}</p>
                </div>
              )}
            </div>
            <button onClick={() => setSelected(null)} className="mt-4 w-full bg-brand-600 text-white py-2 rounded-xl hover:bg-brand-700">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
