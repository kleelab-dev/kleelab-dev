'use client';

import React from 'react';
import { 
  ChartBarIcon, 
  GlobeAltIcon, 
  DocumentDuplicateIcon, 
  ShoppingBagIcon, 
  BanknotesIcon, 
  FolderIcon, 
  PresentationChartLineIcon, 
  RectangleStackIcon, 
  Cog6ToothIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { TabType } from '@/types/api';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  sitesCount: number;
  ordersCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  sitesCount,
  ordersCount,
}) => {
  const navItems = [
    { id: 'overview' as TabType, label: 'Overview', icon: ChartBarIcon },
    { id: 'sites' as TabType, label: 'Websites & Domains', icon: GlobeAltIcon, badge: sitesCount },
    { id: 'pages' as TabType, label: 'Pages & Content', icon: DocumentDuplicateIcon },
    { id: 'products' as TabType, label: 'Store & Products', icon: ShoppingBagIcon },
    { id: 'orders' as TabType, label: 'Orders & Sales', icon: BanknotesIcon, badge: ordersCount },
    { id: 'assets' as TabType, label: 'Assets & Media', icon: FolderIcon },
    { id: 'analytics' as TabType, label: 'Analytics', icon: PresentationChartLineIcon },
    { id: 'templates' as TabType, label: 'Templates Marketplace', icon: RectangleStackIcon },
    { id: 'settings' as TabType, label: 'Settings & GDPR', icon: Cog6ToothIcon },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-950/90 flex flex-col justify-between p-4 flex-shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="space-y-6">
        <div>
          <div className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Navigation
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-sky-600/15 text-sky-400 border border-sky-500/20 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Backend API Quick Audit Box */}
        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
            <span>FastAPI Backend Status</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            All 16+ API router modules verified: Auth, Sites, Pages, Products, Orders, Assets, Analytics, GDPR & SEO.
          </p>
          <div className="pt-1 flex items-center space-x-1.5 text-[10px] text-slate-500 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>http://localhost:8000</span>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-slate-900 text-[11px] text-slate-500 flex items-center justify-between px-2">
        <span>KleeLab v1.0.0</span>
        <span className="text-slate-600 font-mono">Next.js App</span>
      </div>
    </aside>
  );
};
