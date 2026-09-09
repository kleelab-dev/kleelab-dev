'use client';

import React, { useState } from 'react';
import { 
  RectangleStackIcon, 
  SparklesIcon, 
  ArrowRightIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { Template } from '@/types/api';

interface TemplatesTabProps {
  templates: Template[];
  onSelectTemplate: (template: Template) => void;
}

export const TemplatesTab: React.FC<TemplatesTabProps> = ({ templates, onSelectTemplate }) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedTemplateModal, setSelectedTemplateModal] = useState<Template | null>(null);

  const categories = ['All', 'SaaS Landing', 'E-Commerce', 'Personal & Agency', 'Documentation'];

  const filteredTemplates = templates.filter(
    (t) => activeCategory === 'All' || t.category === activeCategory
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Templates Marketplace</h1>
          <p className="text-xs text-slate-400 mt-1">Deploy pre-built site architectures and component libraries instantly.</p>
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredTemplates.map((tmpl) => (
          <div
            key={tmpl.id}
            className="group p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-lg"
          >
            <div className="space-y-3">
              <div className="w-full h-44 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden relative">
                <img
                  src={tmpl.thumbnail_url}
                  alt={tmpl.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {tmpl.is_premium && (
                  <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 flex items-center space-x-1 shadow">
                    <SparklesIcon className="w-3 h-3" />
                    <span>Pro Template</span>
                  </span>
                )}
                <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded text-[10px] font-semibold bg-slate-950/80 text-slate-300 backdrop-blur border border-slate-800">
                  {tmpl.category}
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-100">{tmpl.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{tmpl.description}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">ID: {tmpl.id}</span>
              <button
                onClick={() => setSelectedTemplateModal(tmpl)}
                className="px-3.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors flex items-center space-x-1.5"
              >
                <span>Use Template</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Deployment Modal */}
      {selectedTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Deploy Template</h3>
              <button onClick={() => setSelectedTemplateModal(null)} className="text-slate-400 hover:text-slate-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                You are about to instantiate <strong>{selectedTemplateModal.title}</strong> into a new site repository.
              </p>

              <div className="p-3 rounded bg-slate-800/60 border border-slate-700 text-slate-400 space-y-1">
                <div>Category: <strong className="text-slate-200">{selectedTemplateModal.category}</strong></div>
                <div>Included: <strong className="text-slate-200">4 pre-configured layouts, SEO tags, responsive CSS</strong></div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedTemplateModal(null)}
                className="px-4 py-2 rounded-md bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onSelectTemplate(selectedTemplateModal);
                  setSelectedTemplateModal(null);
                }}
                className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow"
              >
                Confirm & Create Site
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
