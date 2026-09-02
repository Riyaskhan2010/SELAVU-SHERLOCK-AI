import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Cpu, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/authStore";
import { isFirebaseConfigured } from "@/lib/firebase";

const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    clearError();
    try {
      await login(data.email, data.password);
      // Navigation is handled automatically by PublicRoute once firebaseUser is set
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/15 border border-primary/25 mb-4">
            <Cpu className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Selavu Sherlock AI</h1>
          <p className="text-sm text-muted-foreground mt-1">AI Cost Intelligence Platform</p>
        </div>

        {/* Firebase not configured banner */}
        {!isFirebaseConfigured && (
          <div className="mb-4 p-4 rounded-xl bg-orange-400/10 border border-orange-400/25 text-xs space-y-2">
            <p className="font-semibold text-orange-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Firebase configuration required
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Open <code className="text-foreground font-mono bg-secondary/60 px-1 rounded">frontend/.env</code> and
              replace the placeholder values with your Firebase Web App credentials
              from the Firebase Console.
            </p>
            <p className="text-muted-foreground">
              See <code className="text-foreground font-mono bg-secondary/60 px-1 rounded">FIREBASE_SETUP.md</code> for
              step-by-step instructions.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
          <h2 className="text-base font-semibold text-foreground mb-1">Sign in</h2>
          <p className="text-xs text-muted-foreground mb-5">
            Enter your credentials to access your workspace
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs mb-4"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                {...register("email")}
                className={errors.email ? "border-destructive/50" : ""}
              />
              {errors.email && <p className="text-[11px] text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register("password")}
                  className={errors.password ? "border-destructive/50 pr-9" : "pr-9"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {errors.password && <p className="text-[11px] text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || !isFirebaseConfigured}>
              {isLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing in…</>
                : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary hover:underline">Create one</Link>
        </p>
      </motion.div>
    </div>
  );
}
