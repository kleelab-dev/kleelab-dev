'use client';

import React, { useState } from 'react';
import { 
  ShoppingBagIcon, 
  PlusIcon, 
  TagIcon, 
  XMarkIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline';
import { Product } from '@/types/api';

interface ProductsTabProps {
  products: Product[];
  onCreateProduct: (data: Partial<Product>) => void;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({ products, onCreateProduct }) => {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [inventory, setInventory] = useState('100');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    onCreateProduct({
      name,
      description,
      price: parseFloat(price),
      inventory_count: parseInt(inventory, 10) || 0,
      is_active: true,
    });
    setName('');
    setDescription('');
    setPrice('');
    setInventory('100');
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Store & Products Catalog</h1>
          <p className="text-xs text-slate-400 mt-1">Manage digital products, inventory levels, and pricing for your storefronts.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-sm transition-colors flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {products.map((prod) => (
          <div
            key={prod.id}
            className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-lg"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                    <ShoppingBagIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 line-clamp-1">{prod.name}</h3>
                    <span className="text-[11px] text-slate-500 font-mono">{prod.id}</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/60">
                  ${prod.price.toFixed(2)} {prod.currency}
                </span>
              </div>

              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                {prod.description || 'No description provided for this product.'}
              </p>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                <div className="flex items-center space-x-1.5">
                  <ArchiveBoxIcon className="w-4 h-4 text-slate-500" />
                  <span>Stock: {prod.inventory_count} units</span>
                </div>
                <span className="text-emerald-400 font-sans font-medium text-[11px]">Active</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Add New Product</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Developer Suite License"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Feature list and package details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Price ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="99.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Inventory Count</label>
                  <input
                    type="number"
                    required
                    placeholder="100"
                    value={inventory}
                    onChange={(e) => setInventory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-slate-100 rounded-md p-2.5 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-md bg-slate-800 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium shadow"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
