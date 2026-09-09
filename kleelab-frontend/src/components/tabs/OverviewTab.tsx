'use client';

import React from 'react';
import { 
  BanknotesIcon, 
  EyeIcon, 
  ShoppingBagIcon, 
  GlobeAltIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
  DocumentDuplicateIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { DashboardStats, ActivityItem, TabType } from '@/types/api';

interface OverviewTabProps {
  stats: DashboardStats;
  activities: ActivityItem[];
  onNavigate: (tab: TabType) => void;
  onOpenCreateSite: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats,
  activities,
  onNavigate,
  onOpenCreateSite,
}) => {
  const kpiCards = [
    {
      title: 'Total Revenue',
      value: `$${stats.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: '+14.2%',
      positive: true,
      icon: BanknotesIcon,
      accent: 'border-emerald-500/20 bg-emerald-500/5',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
    },
    {
      title: 'Total Traffic Views',
      value: stats.total_views.toLocaleString(),
      change: '+8.7%',
      positive: true,
      icon: EyeIcon,
      accent: 'border-sky-500/20 bg-sky-500/5',
      iconBg: 'bg-sky-500/10 text-sky-400',
    },
    {
      title: 'Total Orders',
      value: stats.total_orders.toString(),
      change: '+19.3%',
      positive: true,
      icon: ShoppingBagIcon,
      accent: 'border-indigo-500/20 bg-indigo-500/5',
      iconBg: 'bg-indigo-500/10 text-indigo-400',
    },
    {
      title: 'Active Sites',
      value: stats.sites_count.toString(),
      change: '4 Live',
      positive: true,
      icon: GlobeAltIcon,
      accent: 'border-purple-500/20 bg-purple-500/5',
      iconBg: 'bg-purple-500/10 text-purple-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Executive Performance Overview</h1>
          <p className="text-xs text-slate-400 mt-1">Real-time metrics, active site statuses, and recent store activity.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate('analytics')}
            className="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-700/70 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-colors flex items-center space-x-1.5"
          >
            <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-sky-400" />
            <span>Full Analytics Report</span>
          </button>
          <button
            onClick={onOpenCreateSite}
            className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-sm transition-colors flex items-center space-x-1.5"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Create Site</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`p-4 rounded-xl border ${card.accent} glass-panel flex flex-col justify-between space-y-3 transition-transform hover:-translate-y-0.5`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{card.title}</span>
                <div className={`p-2 rounded-lg ${card.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold text-slate-100 tracking-tight">{card.value}</span>
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center space-x-0.5">
                  <span>{card.change}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Chart & Quick Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Panel */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Revenue & Pageview Trends</h3>
              <p className="text-xs text-slate-500">Monthly aggregate data over past 30 days</p>
            </div>
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="flex items-center space-x-1 text-sky-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                <span>Revenue ($)</span>
              </span>
              <span className="flex items-center space-x-1 text-slate-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>Pageviews</span>
              </span>
            </div>
          </div>

          {/* SVG Vector Chart */}
          <div className="w-full h-48 relative flex items-end pt-4">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150">
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Grid lines */}
              <line x1="0" y1="0" x2="500" y2="0" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="50" x2="500" y2="50" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="150" x2="500" y2="150" stroke="#1e293b" />

              {/* Gradient Area Fill */}
              <path
                d="M 0,130 Q 70,80 140,95 T 280,40 T 420,60 T 500,20 L 500,150 L 0,150 Z"
                fill="url(#skyGrad)"
              />

              {/* Line 1 - Revenue */}
              <path
                d="M 0,130 Q 70,80 140,95 T 280,40 T 420,60 T 500,20"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Line 2 - Pageviews */}
              <path
                d="M 0,140 Q 70,110 140,120 T 280,70 T 420,85 T 500,45"
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="4 4"
              />

              {/* Data points */}
              <circle cx="140" cy="95" r="4" fill="#38bdf8" />
              <circle cx="280" cy="40" r="4" fill="#38bdf8" />
              <circle cx="500" cy="20" r="4" fill="#38bdf8" />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800/80">
            <span>Aug 10</span>
            <span>Aug 17</span>
            <span>Aug 24</span>
            <span>Sep 01</span>
            <span>Sep 08</span>
          </div>
        </div>

        {/* Quick Actions Shortcuts */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Management Shortcuts</h3>
            <p className="text-xs text-slate-500 mt-0.5">Quickly trigger common backend workflows</p>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={() => onNavigate('sites')}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <GlobeAltIcon className="w-4 h-4 text-sky-400" />
                <span>Manage Sites & Domains</span>
              </div>
              <span className="text-slate-500 text-[10px]">&rarr;</span>
            </button>

            <button
              onClick={() => onNavigate('products')}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <ShoppingBagIcon className="w-4 h-4 text-indigo-400" />
                <span>Add / Edit Store Product</span>
              </div>
              <span className="text-slate-500 text-[10px]">&rarr;</span>
            </button>

            <button
              onClick={() => onNavigate('assets')}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <ArrowUpTrayIcon className="w-4 h-4 text-emerald-400" />
                <span>Upload Media Asset</span>
              </div>
              <span className="text-slate-500 text-[10px]">&rarr;</span>
            </button>

            <button
              onClick={() => onNavigate('settings')}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <ArrowDownTrayIcon className="w-4 h-4 text-amber-400" />
                <span>GDPR Data Export</span>
              </div>
              <span className="text-slate-500 text-[10px]">&rarr;</span>
            </button>
          </div>

          <div className="p-3 rounded bg-sky-950/40 border border-sky-800/40 text-[11px] text-sky-300">
            <strong>System Status:</strong> All FastAPI endpoints responding normally (&lt;15ms latency).
          </div>
        </div>
      </div>

      {/* Recent Activity Timeline Table */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">System Activity Feed</h3>
            <p className="text-xs text-slate-500">Audit log of system events across all active websites</p>
          </div>
          <span className="text-xs text-slate-400 font-mono">Total {activities.length} Events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2 px-3">Event Type</th>
                <th className="py-2 px-3">Title</th>
                <th className="py-2 px-3">Description</th>
                <th className="py-2 px-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {activities.map((act) => (
                <tr key={act.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      {act.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-200">{act.title}</td>
                  <td className="py-3 px-3 text-slate-400">{act.description}</td>
                  <td className="py-3 px-3 text-right text-slate-500 font-mono">{act.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
