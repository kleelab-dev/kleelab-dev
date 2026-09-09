'use client';

import React, { useState } from 'react';
import { 
  BanknotesIcon, 
  FunnelIcon, 
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { Order } from '@/types/api';

interface OrdersTabProps {
  orders: Order[];
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ orders }) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'refunded'>('all');

  const filteredOrders = orders.filter(
    (o) => statusFilter === 'all' || o.status === statusFilter
  );

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <CheckCircleIcon className="w-3 h-3" />
            <span>Completed</span>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-400 border border-amber-800/60">
            <ClockIcon className="w-3 h-3" />
            <span>Pending</span>
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <ArrowPathIcon className="w-3 h-3" />
            <span>Refunded</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-800/60">
            <XCircleIcon className="w-3 h-3" />
            <span>Cancelled</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Orders & Sales Transactions</h1>
          <p className="text-xs text-slate-400 mt-1">Review customer receipts, order statuses, and Stripe transaction logs.</p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          <FunnelIcon className="w-4 h-4 text-slate-500 ml-2 mr-1" />
          {(['all', 'completed', 'pending', 'refunded'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                statusFilter === st ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Order Ref</th>
                <th className="py-2.5 px-3">Customer Email</th>
                <th className="py-2.5 px-3">Items</th>
                <th className="py-2.5 px-3">Amount ($)</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-3 font-mono font-semibold text-slate-200">{order.id}</td>
                  <td className="py-3.5 px-3 font-medium text-slate-300">{order.customer_email}</td>
                  <td className="py-3.5 px-3 text-slate-400 font-mono">{order.items_count} item(s)</td>
                  <td className="py-3.5 px-3 font-bold text-slate-100 font-mono">
                    ${order.total_amount.toFixed(2)} {order.currency}
                  </td>
                  <td className="py-3.5 px-3">{getStatusBadge(order.status)}</td>
                  <td className="py-3.5 px-3 text-right text-slate-500 font-mono">
                    {new Date(order.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
