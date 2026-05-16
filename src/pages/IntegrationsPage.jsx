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
    <div className="app-page native-buttons-page integrations-typography integrations-page-vibe p-6 md:p-10">
      <style>{` 
    @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap");
    .integrations-page-vibe { background-color: #ffffff !important; color: #0d0d0d; min-height: 100vh; }
    .integrations-page-vibe h1, .integrations-page-vibe h2, .integrations-page-vibe h3, .integrations-page-vibe .integrations-header-helvetica, .integrations-page-vibe .migration-header-title { font-family: 'Playfair Display', serif; font-weight: 400; color: #0d0d0d; letter-spacing: 0.02em; }
    .integrations-page-vibe .integrations-subtle, .integrations-page-vibe .migration-subtle { color: #666666; }
    .integrations-page-vibe [class*="text-white/"] { color: #666666 !important; }
    .integrations-page-vibe [class*="text-white"] { color: #0d0d0d !important; }
    .integrations-page-vibe [class*="bg-white/[0.02]"], .integrations-page-vibe [class*="bg-white/[0.04]"], .integrations-page-vibe [class*="bg-black/20"], .integrations-page-vibe [class*="bg-[#151921]"], .integrations-page-vibe [class*="bg-[#0a0c10]"] { background-color: #fafafa !important; }
    .integrations-page-vibe [class*="bg-[#fbfbfb]"], .integrations-page-vibe .bg-\[\#fbfbfb\] { background-color: #fafafa !important; }
    .integrations-page-vibe [class*="border-white"] { border-color: rgba(0,0,0,0.12) !important; }
    .integrations-page-vibe [class*="border-\[\#e6e6e6\]"], .integrations-page-vibe .border-\[\#e6e6e6\] { border-color: rgba(0,0,0,0.12) !important; }
    .integrations-page-vibe button { border-color: rgba(0,0,0,0.12) !important; }
    /* Card title color (preserve main header color) */
    .integrations-page-vibe .migration-header-title { color: #6b6b6b !important; }
    .integrations-page-vibe header .migration-header-title { color: #0d0d0d !important; }
    `}</style>
      <div className="w-full max-w-[1200px] mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-[10px] tracking-[0.25em] font-mono integrations-subtle">
            Migration
          </p>
          <h1 className="migration-header-title text-4xl md:text-5xl font-medium tracking-tighter" style={{ fontFamily: "'Playfair Display', serif" }}>
            Data <span className="integrations-subtle">Migration</span>
          </h1>
          <p className="text-sm integrations-subtle">
            One clean standard format for all imports. Legacy files are auto-detected during migration.
          </p>
        </header>

        <section className="border border-[#e6e6e6] bg-[#fbfbfb] p-5 md:p-6 rounded-2xl">
          <p className="migration-header-title text-[10px] tracking-[0.2em] text-[#0d0d0d] uppercase mb-4">
            Download Templates
          </p>
          <p className="text-xs integrations-subtle mb-4">
            Download and fill these standard templates, then use migration below.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {["customers", "payments"].map((importType) => (
              <button
                key={importType}
                type="button"
                onClick={() => downloadTemplate(importType)}
                className="border border-[#e6e6e6] hover:border-[#d6d6d6] p-4 flex items-center justify-between transition-colors rounded-xl bg-white"
              >
                <div>
                  <p className="migration-header-title text-sm text-[#0d0d0d] capitalize">{importType} File</p>
                  <p className="text-[10px] integrations-subtle tracking-[0.15em] mt-1">
                    {selectedSourceName}
                  </p>
                </div>
                <Download size={16} className="text-[#666666]" />
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] tracking-[0.25em] font-mono integrations-subtle">
              Migration
            </p>
            <h2 className="migration-header-title text-2xl md:text-[2.05rem] text-[#0d0d0d]">Automatic Migration</h2>
          </div>
          <AutoMigrationPage embedded />
        </section>
      </div>
    </div>
  );
};

export default IntegrationsPage;
