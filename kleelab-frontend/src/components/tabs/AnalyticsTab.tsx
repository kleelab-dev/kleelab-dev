'use client';

import React from 'react';
import { 
  PresentationChartLineIcon, 
  UserGroupIcon, 
  ArrowTrendingUpIcon, 
  ClockIcon,
  GlobeAmericasIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';

export const AnalyticsTab: React.FC = () => {
  const topPages = [
    { path: '/pricing', views: '18,420', rate: '4.8%' },
    { path: '/', views: '14,210', rate: '3.2%' },
    { path: '/contact', views: '9,100', rate: '6.1%' },
    { path: '/docs/quickstart', views: '7,190', rate: '1.9%' },
  ];

  const referrers = [
    { source: 'Google Search (Organic)', count: '24,100', share: '49.2%' },
    { source: 'GitHub / Documentation', count: '11,400', share: '23.3%' },
    { source: 'Twitter / X Ads', count: '8,200', share: '16.7%' },
    { source: 'Direct Access', count: '5,220', share: '10.8%' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Traffic & Performance Analytics</h1>
          <p className="text-xs text-slate-400 mt-1">Monitored metrics via `/api/analytics/summary` endpoint.</p>
        </div>
      </div>

      {/* Analytics KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-sky-950 text-sky-400 border border-sky-800">
            <UserGroupIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Unique Visitors</div>
            <div className="text-lg font-bold text-slate-100 font-mono">32,410</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
            <ArrowTrendingUpIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Conversion Rate</div>
            <div className="text-lg font-bold text-slate-100 font-mono">3.42%</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800">
            <ClockIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Avg. Session Duration</div>
            <div className="text-lg font-bold text-slate-100 font-mono">2m 45s</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-purple-950 text-purple-400 border border-purple-800">
            <GlobeAmericasIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Bounce Rate</div>
            <div className="text-lg font-bold text-slate-100 font-mono">34.1%</div>
          </div>
        </div>
      </div>

      {/* Grid details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Top Performing Pages</h3>
          <div className="space-y-3 text-xs">
            {topPages.map((pg) => (
              <div key={pg.path} className="flex items-center justify-between p-2.5 rounded bg-slate-800/40 border border-slate-800">
                <span className="font-mono text-sky-400">{pg.path}</span>
                <div className="flex items-center space-x-4">
                  <span className="text-slate-300 font-mono">{pg.views} views</span>
                  <span className="text-emerald-400 font-semibold">{pg.rate} conv.</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Referrer Sources */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Traffic Referrers</h3>
          <div className="space-y-3 text-xs">
            {referrers.map((ref) => (
              <div key={ref.source} className="flex items-center justify-between p-2.5 rounded bg-slate-800/40 border border-slate-800">
                <span className="text-slate-300 font-medium">{ref.source}</span>
                <div className="flex items-center space-x-3">
                  <span className="text-slate-400 font-mono">{ref.count}</span>
                  <span className="text-sky-400 font-mono font-semibold">{ref.share}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
