import React from "react";
import { Download } from "lucide-react";
import AutoMigrationPage from "./AutoMigrationPage";
import { setImportSourcePreset } from "../lib/importJobs";

const TEMPLATE_HEADERS = {
  customers: [
    "first_name",
    "last_name",
    "phone",
    "email",
    "membership_duration",
    "membership_start_date",
    "membership_end_date",
  ],
  payments: [
    "amount",
    "status",
    "payment_mode",
    "sender_name",
    "sender_phone",
    "sender_account_name",
    "source_transaction_id",
    "created_at",
  ],
};

const IntegrationsPage = () => {
  const selectedSourceName = "Standard File Format";

  const downloadTemplate = (importType) => {
    const headers = TEMPLATE_HEADERS[importType] || [];
    const csv = `${headers.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `standard_${importType}_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  React.useEffect(() => {
    setImportSourcePreset("generic");
  }, []);

  return (
    <div className="app-page native-buttons-page integrations-typography p-6 md:p-10">
      <div className="w-full max-w-[1200px] mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-[10px] tracking-[0.25em] font-mono text-white/40">
            Migration
          </p>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-white integrations-header-helvetica">
            Data Migration
          </h1>
          <p className="text-sm text-white/50">
            One clean standard format for all imports. Legacy files are auto-detected during migration.
          </p>
        </header>

        <section className="border border-white/10 bg-white/[0.02] p-5 md:p-6">
          <p className="text-[10px] tracking-[0.2em] font-mono text-white/40 mb-4">
            Download Templates
          </p>
          <p className="text-xs text-white/50 mb-4">
            Download and fill these standard templates, then use migration below.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {["customers", "payments"].map((importType) => (
              <button
                key={importType}
                type="button"
                onClick={() => downloadTemplate(importType)}
                className="border border-white/10 hover:border-white/20 p-4 flex items-center justify-between transition-colors"
              >
                <div>
                  <p className="text-sm text-white capitalize">{importType} File</p>
                  <p className="text-[10px] text-white/40 tracking-[0.15em] mt-1">
                    {selectedSourceName}
                  </p>
                </div>
                <Download size={16} className="text-white/60" />
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] tracking-[0.25em] font-mono text-white/40">
              Migration
            </p>
            <h2 className="text-2xl text-white integrations-migration-title">Automatic Migration</h2>
          </div>
          <AutoMigrationPage embedded />
        </section>
      </div>
    </div>
  );
};

export default IntegrationsPage;
