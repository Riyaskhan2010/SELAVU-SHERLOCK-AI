import { useRef, useState } from "react";
import { Bell, ChevronDown, Search, Upload, LogOut, User as UserIcon, History, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";
import { datasetsApi } from "@/services/api";
import { cn } from "@/lib/utils";

export function TopNav() {
  const { user, logout } = useAuthStore();
  const {
    datasets, activeDatasetId, setActiveDataset,
    unreadNotifications, clearUserData, refreshDatasets,
  } = useAppStore();
  const navigate = useNavigate();

  // ── Inline upload state ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  const readyDatasets = datasets.filter((d) => d.status === "ready");

  const handleLogout = async () => {
    clearUserData();
    await logout();
    navigate("/login");
  };

  // ── File picker trigger — opens native picker WITHOUT navigating ────────────
  const openFilePicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadError(null);
    fileInputRef.current?.click();
  };

  // ── Handle file selected ────────────────────────────────────────────────────
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected if needed
    e.target.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["csv", "json"].includes(ext)) {
      setUploadError("Only CSV and JSON files are supported");
      return;
    }

    const datasetName = file.name.replace(/\.[^.]+$/, "");
    setUploadFileName(file.name);
    setUploading(true);
    setUploadError(null);

    try {
      const dataset = await datasetsApi.upload(file, datasetName);
      // Refresh dataset list and auto-select the new dataset
      await refreshDatasets();
      setActiveDataset(dataset.id);
      setUploadFileName(null);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-6 gap-4 shrink-0 sticky top-0 z-10">

      {/* Dataset selector + upload trigger */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Hidden file input — always in DOM */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={handleFileSelected}
        />

        <div className="w-52">
          {readyDatasets.length > 0 ? (
            <Select
              value={activeDatasetId?.toString() ?? ""}
              onValueChange={(v) => setActiveDataset(parseInt(v))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select dataset…" />
              </SelectTrigger>
              <SelectContent>
                {readyDatasets.map((d) => (
                  <SelectItem key={d.id} value={d.id.toString()}>
                    <span className="truncate max-w-[160px] block">{d.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : uploading ? (
            <div className="h-8 flex items-center gap-2 px-2 border border-border rounded-md bg-secondary/40 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span className="truncate">{uploadFileName ?? "Uploading…"}</span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs w-full justify-start text-muted-foreground"
              onClick={openFilePicker}
              type="button"
            >
              <Upload className="w-3 h-3 mr-2 shrink-0" />
              Upload dataset
            </Button>
          )}
        </div>

        {/* Upload icon — always visible for quick access when datasets exist */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={openFilePicker}
          type="button"
          title="Upload dataset"
          disabled={uploading}
        >
          {uploading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Upload className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Upload error tooltip */}
      {uploadError && (
        <div className="absolute top-14 left-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/25 text-xs text-destructive shadow-lg">
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="ml-2 shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex-1 max-w-xs hidden md:block">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search findings…"
            className="h-8 pl-8 text-xs bg-secondary/40"
          />
        </div>
      </div>

      <div className="flex-1" />

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative h-8 w-8">
        <Bell className="w-4 h-4" />
        {unreadNotifications > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center">
            {unreadNotifications}
          </span>
        )}
      </Button>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-2 gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
              {initials}
            </div>
            <span className="text-xs text-foreground hidden sm:block max-w-28 truncate">
              {user?.full_name ?? user?.email ?? "User"}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div className="font-medium text-foreground text-xs truncate">{user?.full_name}</div>
            <div className="text-muted-foreground font-normal text-xs truncate">{user?.email}</div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => navigate("/settings")}>
            <UserIcon className="w-4 h-4" />
            Profile &amp; Settings
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => navigate("/history")}>
            <History className="w-4 h-4" />
            Dataset History
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
