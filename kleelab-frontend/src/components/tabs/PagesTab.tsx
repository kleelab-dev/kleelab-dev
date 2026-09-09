'use client';

import React, { useState } from 'react';
import { 
  DocumentDuplicateIcon, 
  PlusIcon, 
  ClockIcon, 
  ArrowPathIcon,
  XMarkIcon,
  PencilSquareIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { Page, PageVersion } from '@/types/api';

interface PagesTabProps {
  pages: Page[];
  onCreatePage: (data: Partial<Page>) => void;
}

export const PagesTab: React.FC<PagesTabProps> = ({ pages, onCreatePage }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedVersionPage, setSelectedVersionPage] = useState<Page | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDesc, setSeoDesc] = useState('');

  const sampleVersions: PageVersion[] = [
    { id: 'v_3', page_id: 'pg_1', version_number: 3, content_json: {}, created_at: '2026-09-08 14:20', created_by: 'Alex Rivera' },
    { id: 'v_2', page_id: 'pg_1', version_number: 2, content_json: {}, created_at: '2026-09-01 10:15', created_by: 'Alex Rivera' },
    { id: 'v_1', page_id: 'pg_1', version_number: 1, content_json: {}, created_at: '2026-02-01 10:05', created_by: 'System' },
  ];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;
    onCreatePage({
      title,
      slug: slug.startsWith('/') ? slug : `/${slug}`,
      seo_title: seoTitle,
      seo_description: seoDesc,
    });
    setTitle('');
    setSlug('');
    setSeoTitle('');
    setSeoDesc('');
    setShowCreateModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Pages & Content Manager</h1>
          <p className="text-xs text-slate-400 mt-1">Create, edit, and roll back versions for page layouts and SEO tags.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-sm transition-colors flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New Page</span>
        </button>
      </div>

      {/* Pages Table */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Title & Slug</th>
                <th className="py-2.5 px-3">SEO Details</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Last Modified</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-200 text-sm flex items-center space-x-2">
                      <DocumentDuplicateIcon className="w-4 h-4 text-sky-400" />
                      <span>{page.title}</span>
                    </div>
                    <div className="text-slate-500 font-mono text-[11px] mt-0.5">{page.slug}</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-slate-300 truncate max-w-xs">{page.seo_title || page.title}</div>
                    <div className="text-slate-500 text-[11px] truncate max-w-xs">{page.seo_description || 'No SEO description set'}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      page.is_published ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {page.is_published ? 'Live' : 'Draft'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                    {new Date(page.updated_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-3 text-right space-x-2">
                    <button
                      onClick={() => setSelectedVersionPage(page)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium inline-flex items-center space-x-1 border border-slate-700"
                    >
                      <ClockIcon className="w-3.5 h-3.5 text-sky-400" />
                      <span>Versions</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Page Versions Modal */}
      {selectedVersionPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">Version History</h3>
                <p className="text-xs text-slate-400">{selectedVersionPage.title} ({selectedVersionPage.slug})</p>
              </div>
              <button onClick={() => setSelectedVersionPage(null)} className="text-slate-400 hover:text-slate-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {sampleVersions.map((v) => (
                <div key={v.id} className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
                      <span>Version {v.version_number}</span>
                      {v.version_number === 3 && (
                        <span className="bg-emerald-950 text-emerald-400 text-[10px] px-2 py-0.5 rounded border border-emerald-800">Active</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">Updated on {v.created_at} by {v.created_by}</div>
                  </div>

                  {v.version_number !== 3 && (
                    <button
                      onClick={() => alert(`Rolled back ${selectedVersionPage.title} to version ${v.version_number}`)}
                      className="px-2.5 py-1 rounded bg-sky-950/60 hover:bg-sky-900/60 text-sky-400 border border-sky-800 text-xs font-medium flex items-center space-x-1"
                    >
                      <ArrowPathIcon className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedVersionPage(null)}
                className="px-4 py-1.5 rounded bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Page Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Create New Page</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Page Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Terms of Service"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">URL Slug</label>
                <input
                  type="text"
                  required
                  placeholder="/terms"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">SEO Title</label>
                <input
                  type="text"
                  placeholder="Meta Title"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-md bg-slate-800 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium shadow"
                >
                  Save Page
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
