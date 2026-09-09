'use client';

import React, { useState } from 'react';
import { 
  Cog6ToothIcon, 
  ShieldCheckIcon, 
  ArrowDownTrayIcon, 
  ExclamationTriangleIcon,
  CreditCardIcon,
  UserCircleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { Subscription, User } from '@/types/api';

interface SettingsTabProps {
  user: User;
  subscription: Subscription;
  onExportGdpr: () => void;
  onRequestDeletion: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  user,
  subscription,
  onExportGdpr,
  onRequestDeletion,
}) => {
  const [deletionRequested, setDeletionRequested] = useState(false);

  const handleDeleteRequest = () => {
    if (confirm('Are you sure you want to submit a formal GDPR deletion request for your account and all associated site data?')) {
      onRequestDeletion();
      setDeletionRequested(true);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="pb-2 border-b border-slate-800">
        <h1 className="text-xl font-bold text-slate-100 tracking-tight">Settings & GDPR Compliance</h1>
        <p className="text-xs text-slate-400 mt-1">Manage subscription billing, user credentials, and privacy compliance data exports.</p>
      </div>

      {/* Account Profile Card */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
          <UserCircleIcon className="w-8 h-8 text-sky-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Administrator Profile</h3>
            <p className="text-xs text-slate-500">Authenticated account details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500">Full Name</span>
            <div className="font-medium text-slate-200 mt-0.5">{user.full_name}</div>
          </div>
          <div>
            <span className="text-slate-500">Email Address</span>
            <div className="font-mono text-slate-200 mt-0.5">{user.email}</div>
          </div>
          <div>
            <span className="text-slate-500">User ID</span>
            <div className="font-mono text-slate-400 mt-0.5">{user.id}</div>
          </div>
          <div>
            <span className="text-slate-500">Superuser Privilege</span>
            <div className="font-semibold text-emerald-400 mt-0.5">Active</div>
          </div>
        </div>
      </div>

      {/* Subscription Billing Card */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <CreditCardIcon className="w-8 h-8 text-indigo-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Stripe Subscription Plan</h3>
              <p className="text-xs text-slate-500">Connected to FastAPI Stripe billing webhooks</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            {subscription.status.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-500">Active Tier</span>
            <div className="font-semibold text-slate-200 mt-0.5">{subscription.plan_name}</div>
          </div>
          <div>
            <span className="text-slate-500">Renews On</span>
            <div className="font-mono text-slate-300 mt-0.5">
              {new Date(subscription.current_period_end).toLocaleDateString()}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Auto Renew</span>
            <div className="text-slate-300 mt-0.5">
              {subscription.cancel_at_period_end ? 'Will Cancel' : 'Enabled'}
            </div>
          </div>
        </div>
      </div>

      {/* GDPR Data Compliance */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
          <ShieldCheckIcon className="w-8 h-8 text-emerald-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">GDPR Privacy & Data Rights</h3>
            <p className="text-xs text-slate-500">Backed by FastAPI endpoints `/api/gdpr/export` and `/api/gdpr/request-deletion`</p>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* Data Export */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 gap-3">
            <div>
              <h4 className="font-semibold text-slate-200">Export Account Data Archive</h4>
              <p className="text-slate-400 text-[11px]">Download a full JSON dump containing all sites, pages, assets, and orders.</p>
            </div>
            <button
              onClick={onExportGdpr}
              className="px-3.5 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center space-x-1.5 self-start sm:self-auto shrink-0"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              <span>Export Data JSON</span>
            </button>
          </div>

          {/* Account Deletion */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-rose-950/20 border border-rose-900/40 gap-3">
            <div>
              <h4 className="font-semibold text-rose-300">Request Data Deletion (Right to be Forgotten)</h4>
              <p className="text-slate-400 text-[11px]">Submits a request to wipe all database records associated with this profile.</p>
            </div>
            {deletionRequested ? (
              <span className="px-3 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-semibold flex items-center space-x-1">
                <CheckCircleIcon className="w-4 h-4" />
                <span>Request Logged</span>
              </span>
            ) : (
              <button
                onClick={handleDeleteRequest}
                className="px-3.5 py-1.5 rounded bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-700/60 font-medium flex items-center space-x-1.5 self-start sm:self-auto shrink-0"
              >
                <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                <span>Request Deletion</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
