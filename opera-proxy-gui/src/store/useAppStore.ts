import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppSettings, DiscoverResult, LaunchRecord } from "../../electron/main/types";

type PageKey = "dashboard" | "discover" | "launch" | "runs" | "logs" | "settings";

type DiscoverFormState = {
  country: string;
  repeat: number;
  sortBy: "speed" | "country" | "ip";
};

type LaunchFormState = {
  csvPath: string;
  startPort: number;
  sortBy: "speed" | "country" | "ip";
  onlyOkSpeed: boolean;
  maxSpeedMs: string;
  noStopExisting: boolean;
};

type AppState = {
  page: PageKey;
  settings?: AppSettings;
  settingsDraft?: AppSettings;
  discover?: DiscoverResult;
  discoverForm: DiscoverFormState;
  launchForm: LaunchFormState;
  logsStderrOnly: boolean;
  launchRecords: LaunchRecord[];
  activeRunId?: string;
  setPage: (page: PageKey) => void;
  setSettings: (settings: AppSettings) => void;
  setSettingsDraft: (settings?: AppSettings) => void;
  setDiscover: (discover: DiscoverResult) => void;
  setDiscoverForm: (patch: Partial<DiscoverFormState>) => void;
  setLaunchForm: (patch: Partial<LaunchFormState>) => void;
  setLogsStderrOnly: (value: boolean) => void;
  setLaunchRecords: (records: LaunchRecord[]) => void;
  setActiveRunId: (runId?: string) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      page: "dashboard",
      launchRecords: [],
      discoverForm: {
        country: "ALL",
        repeat: 5,
        sortBy: "speed"
      },
      launchForm: {
        csvPath: "",
        startPort: 8080,
        sortBy: "speed",
        onlyOkSpeed: true,
        maxSpeedMs: "",
        noStopExisting: false
      },
      logsStderrOnly: false,
      setPage: (page) => set({ page }),
      setSettings: (settings) => set({ settings }),
      setSettingsDraft: (settingsDraft) => set({ settingsDraft }),
      setDiscover: (discover) => set({ discover }),
      setDiscoverForm: (patch) =>
        set((state) => ({
          discoverForm: { ...state.discoverForm, ...patch }
        })),
      setLaunchForm: (patch) =>
        set((state) => ({
          launchForm: { ...state.launchForm, ...patch }
        })),
      setLogsStderrOnly: (logsStderrOnly) => set({ logsStderrOnly }),
      setLaunchRecords: (launchRecords) => set({ launchRecords }),
      setActiveRunId: (activeRunId) => set({ activeRunId })
    }),
    {
      name: "opera-proxy-gui-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        page: state.page,
        settingsDraft: state.settingsDraft,
        discoverForm: state.discoverForm,
        launchForm: state.launchForm,
        logsStderrOnly: state.logsStderrOnly,
        activeRunId: state.activeRunId
      })
    }
  )
);
