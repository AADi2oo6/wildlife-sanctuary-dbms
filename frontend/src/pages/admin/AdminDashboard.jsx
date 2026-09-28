import React, { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";

// Shared
import { TABS }         from "./shared/adminConstants";
import { Eyebrow, Toast } from "./shared/adminComponents";

// Tabs
import OverviewTab    from "./tabs/OverviewTab";
import VisitorsTab    from "./tabs/VisitorsTab";
import StaffTab       from "./tabs/StaffTab";
import AnimalsTab     from "./tabs/AnimalsTab";
import ZonesTab       from "./tabs/ZonesTab";
import EnclosuresTab  from "./tabs/EnclosuresTab";
import HealthLogsTab  from "./tabs/HealthLogsTab";
import SurveysTab     from "./tabs/SurveysTab";
import FeedbackTab    from "./tabs/FeedbackTab";
import TicketsTab     from "./tabs/TicketsTab";
import IotMapTab      from "./tabs/IotMapTab";

const TAB_COMPONENTS = {
  overview:    OverviewTab,
  "iot-map":   IotMapTab,
  visitors:    VisitorsTab,
  staff:       StaffTab,
  animals:     AnimalsTab,
  zones:       ZonesTab,
  enclosures:  EnclosuresTab,
  health:      HealthLogsTab,
  surveys:     SurveysTab,
  feedback:    FeedbackTab,
  tickets:     TicketsTab,
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [toast, setToast]         = useState(null); // { msg, type }

  const showToast = (msg, type = "success") => setToast({ msg, type });

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <DashboardLayout>
      <div className="px-6 py-10 md:px-10 xl:px-16">

        {/* ── Page heading ── */}
        <div className="mb-8">
          <Eyebrow>Abhayarnya · Control Centre</Eyebrow>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-white md:text-5xl">
            Admin <span style={{ color: "#a3e635" }}>Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-white/28">Full administrative control over sanctuary data and operations.</p>
        </div>

        {/* ── Tab bar ── */}
        <div
          className="mb-8 flex flex-wrap gap-1 p-1.5"
          style={{ background: "rgba(13,26,15,0.70)", borderRadius: "14px", border: "1px solid rgba(163,230,53,0.09)" }}
        >
          {TABS.map(tab => {
            const Icon   = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.22em] transition-all duration-150"
                style={{
                  borderRadius: "10px",
                  background: active ? "#a3e635" : "transparent",
                  color:       active ? "#0d1a0f" : "rgba(255,255,255,0.35)",
                }}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Active tab ── */}
        <ActiveComponent toast={showToast} />

      </div>

      {/* ── Toast notification ── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </DashboardLayout>
  );
};

export default AdminDashboard;
