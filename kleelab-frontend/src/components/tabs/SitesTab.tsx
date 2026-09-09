'use client';

import React, { useState } from 'react';
import { 
  GlobeAltIcon, 
  PlusIcon, 
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  XMarkIcon,
  PencilSquareIcon,
  EllipsisHorizontalIcon
} from '@heroicons/react/24/outline';
import { Site } from '@/types/api';

interface SitesTabProps {
  sites: Site[];
  onTogglePublish: (siteId: string, publish: boolean) => void;
  onCreateSite: (data: Partial<Site>) => void;
}

export const SitesTab: React.FC<SitesTabProps> = ({
  sites,
  onTogglePublish,
  onCreateSite,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subdomain.trim()) return;
    onCreateSite({
      name,
      subdomain,
      custom_domain: customDomain.trim() || null,
    });
    setName('');
    setSubdomain('');
    setCustomDomain('');
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Websites & Domains</h1>
          <p className="text-xs text-slate-400 mt-1">Manage your active digital sites, custom domains, and publishing state.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-sm transition-colors flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New Site</span>
        </button>
      </div>

      {/* Sites Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sites.map((site) => (
          <div
            key={site.id}
            className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-lg shadow-black/20"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400">
                    <GlobeAltIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{site.name}</h3>
                    <span className="text-[11px] text-slate-500 font-mono">ID: {site.id}</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    site.is_published
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${site.is_published ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span>{site.is_published ? 'Published' : 'Draft'}</span>
                </span>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Subdomain:</span>
                  <span className="font-mono text-slate-300">{site.subdomain}.kleelab.app</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Custom Domain:</span>
                  <span className="font-mono text-slate-300">
                    {site.custom_domain ? (
                      <a
                        href={`https://${site.custom_domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:underline inline-flex items-center space-x-1"
                      >
                        <span>{site.custom_domain}</span>
                        <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-600 italic">None configured</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Pages Count:</span>
                  <span className="font-semibold text-slate-200">{site.pages_count || 0}</span>
                </div>
              </div>
            </div>

            {/* Site Actions */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <button
                onClick={() => onTogglePublish(site.id, !site.is_published)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  site.is_published
                    ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                    : 'border-emerald-600/40 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400'
                }`}
              >
                {site.is_published ? 'Unpublish Site' : 'Publish Site'}
              </button>

              <div className="flex items-center space-x-2">
                <a
                  href={`https://${site.custom_domain || `${site.subdomain}.kleelab.app`}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60"
                  title="Preview Website"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Site Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Create New Website</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Site Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme SaaS Marketing"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Subdomain Slug</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="acme-saas"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-l-md p-2.5 outline-none font-mono"
                  />
                  <span className="bg-slate-800 border border-l-0 border-slate-800 text-slate-400 px-3 py-2.5 rounded-r-md text-xs font-mono">
                    .kleelab.app
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Custom Domain (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. acme.com"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium shadow"
                >
                  Create Website
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
