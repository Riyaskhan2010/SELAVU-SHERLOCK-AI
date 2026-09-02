import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/authStore";
import { Cpu, Shield, Database, Bot } from "lucide-react";

export function SettingsPage() {
  const { user } = useAuthStore();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Account and platform configuration</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary">
              {user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "??"}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-4 h-4" /> AI Provider</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Configure the LLM provider via the <code className="text-primary font-mono text-[11px]">LLM_PROVIDER</code> environment variable in your backend <code className="text-primary font-mono text-[11px]">.env</code> file.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {["openai", "anthropic", "ollama", "mock"].map((p) => (
              <div key={p} className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                <span className="text-xs font-mono text-foreground">{p}</span>
                {p === "mock" && <Badge variant="secondary" className="text-[9px] ml-auto">default</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="w-4 h-4" /> Database</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Configure via <code className="text-primary font-mono text-[11px]">DATABASE_URL</code> in backend <code className="text-primary font-mono text-[11px]">.env</code>.
            Defaults to SQLite for local development. Use PostgreSQL for production.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-4 h-4" /> Security</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            JWT authentication with bcrypt password hashing.
            Set a strong <code className="text-primary font-mono text-[11px]">SECRET_KEY</code> in production.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
