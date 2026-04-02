import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, PlugZap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getImportSourcePreset, setImportSourcePreset } from '../lib/importJobs';
const SOURCE_PRESETS = [ { id: 'generic', name: 'Standard File Format', description: 'Use this for Excel/Google Sheet exports with clear field names like first_name and phone.', }, { id: 'legacy_a', name: 'Old App Format 1', description: 'Use this when your columns look like First Name, Mobile No, Email ID, Plan.', }, { id: 'legacy_b', name: 'Old App Format 2', description: 'Use this when your columns look like firstname, phone_number, plan_name, transaction_id.', }, ];
const TEMPLATE_HEADERS = { customers: { generic: ['first_name', 'last_name', 'phone', 'email', 'membership_duration', 'membership_start_date', 'membership_end_date'], legacy_a: ['First Name', 'Last Name', 'Mobile No', 'Email ID', 'Plan', 'Start Date', 'End Date'], legacy_b: ['firstname', 'lastname', 'phone_number', 'email', 'plan_name', 'start_date', 'end_date'], }, payments: { generic: ['amount', 'status', 'payment_mode', 'sender_name', 'sender_account_name', 'source_transaction_id', 'created_at'], legacy_a: ['Amount', 'Status', 'Mode', 'Customer Name', 'Account Name', 'Transaction ID', 'Payment Date'], legacy_b: ['amount', 'payment_status', 'mode', 'customer_name', 'sender_account_name', 'transaction_id', 'created_at'], }, memberships: { generic: ['customer_name', 'legacy_plan_name', 'start_date', 'end_date'], legacy_a: ['Member Name', 'Plan Name', 'Start Date', 'Expiry Date'], legacy_b: ['customer_name', 'plan_name', 'start_date', 'end_date'], }, };

const IntegrationsPage = () => {
  const navigate = useNavigate();
  const [selectedSourceId, setSelectedSourceId] = useState(getImportSourcePreset());

  useEffect(() => {
    setSelectedSourceId(getImportSourcePreset());
  }, []);

  const selectedSource = useMemo(
    () => SOURCE_PRESETS.find((source) => source.id === selectedSourceId) || SOURCE_PRESETS[0],
    [selectedSourceId]
  );

  const downloadTemplate = (importType) => {
    const headers = TEMPLATE_HEADERS[importType]?.[selectedSource.id] || TEMPLATE_HEADERS[importType]?.generic || [];
    const csv = `${headers.join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedSource.id}_${importType}_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-page native-buttons-page integrations-typography p-6 md:p-10">
      <div className="w-full max-w-[1200px] mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-[10px] tracking-[0.25em] font-mono text-white/40">Set Up Your Import</p>
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white">Guided Data Move</h1>
          <p className="text-sm text-white/50">Pick your old app format and download ready files to move your data.</p>
        </header>

        <section className="border border-white/10 bg-white/[0.02] p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <PlugZap size={16} className="text-emerald-400" />
            <p className="text-[10px] tracking-[0.2em] font-mono text-white/40">Choose App Format</p>
          </div>
          <p className="text-xs text-white/50 mb-4">
            Tip: open your old export file and compare the column names with the examples below, then pick the matching format.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SOURCE_PRESETS.map((source) => {
              const active = source.id === selectedSource.id;
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => {
                    setSelectedSourceId(source.id);
                    setImportSourcePreset(source.id);
                  }}
                  className={`text-left border p-4 transition-colors ${
                    active ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <p className="text-sm text-white tracking-wide">{source.name}</p>
                  <p className="text-xs text-white/50 mt-1">{source.description}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 border border-white/10 bg-white/[0.01] p-4 space-y-2">
            <p className="text-[10px] tracking-[0.15em] font-mono text-white/50">How To Identify The Right Format</p>
            <p className="text-xs text-white/60">
              <span className="text-white/80">Standard File Format:</span> usually has columns like{' '}
              <span className="font-mono">first_name, last_name, phone, email</span>
            </p>
            <p className="text-xs text-white/60">
              <span className="text-white/80">Old App Format 1:</span> usually has columns like{' '}
              <span className="font-mono">First Name, Mobile No, Email ID, Plan</span>
            </p>
            <p className="text-xs text-white/60">
              <span className="text-white/80">Old App Format 2:</span> usually has columns like{' '}
              <span className="font-mono">firstname, phone_number, plan_name, payment_status</span>
            </p>
            <p className="text-[10px] text-amber-300/90">If unsure, choose Standard File Format and use downloaded templates from this page.</p>
          </div>
        </section>

        <section className="border border-white/10 bg-white/[0.02] p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet size={16} className="text-emerald-400" />
            <p className="text-[10px] tracking-[0.2em] font-mono text-white/40">Download Ready Files</p>
          </div>
          <p className="text-xs text-white/50 mb-4">After filling these files, go to Auto Migration page to upload and move your data.</p>
          <div className="border border-white/10 bg-white/[0.01] p-3 mb-4 space-y-1">
            <p className="text-[10px] tracking-[0.12em] font-mono text-white/60">How To Use These Files</p>
            <p className="text-xs text-white/55">Step 1: Download the files you need below.</p>
            <p className="text-xs text-white/55">Step 2: Open each file in Excel, Google Sheets, or any spreadsheet app.</p>
            <p className="text-xs text-white/55">Step 3: Fill in the rows with your old member and payment data.</p>
            <p className="text-xs text-white/55">Step 4: Save the files on your computer.</p>
            <p className="text-xs text-white/55">Step 5: Go to Auto Migration and upload the filled files.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {['customers', 'payments', 'memberships'].map((importType) => (
              <button
                key={importType}
                type="button"
                onClick={() => downloadTemplate(importType)}
                className="border border-white/10 hover:border-white/20 p-4 flex items-center justify-between transition-colors"
              >
                <div>
                  <p className="text-sm text-white capitalize">{importType} File</p>
                  <p className="text-[10px] text-white/40 tracking-[0.15em] mt-1">{selectedSource.name}</p>
                </div>
                <Download size={16} className="text-white/60" />
              </button>
            ))}
          </div>
        </section>

        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => navigate('/auto-migration')}
            className="border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 px-12 py-5 text-center rounded-lg transition-colors"
          >
            <p className="text-lg text-white font-medium">Open Auto Migration</p>
            <p className="text-[10px] text-emerald-200 tracking-[0.15em] mt-2">Upload files and move your data now</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default IntegrationsPage;