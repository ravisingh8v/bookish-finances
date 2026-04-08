import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Wallet, ArrowRight, Loader2, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const { session, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  if (authLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
      else toast.success("Welcome back!");
    } else {
      if (!displayName.trim()) { toast.error("Please enter your name"); setLoading(false); return; }
      const { error } = await signUp(email, password, displayName);
      if (error) toast.error(error.message);
      else toast.success("Account created! Check your email to verify.");
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { toast.error("Enter your email"); return; }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent! Check your inbox.");
    setForgotLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/10" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, hsl(var(--primary) / 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(var(--accent) / 0.1) 0%, transparent 50%)",
        }} />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-md text-center px-8"
        >
          <div className="mx-auto w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-8">
            <Wallet className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-4">ExpenseFlow</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Track expenses, split costs with friends, and stay on top of your finances — all in one beautiful workspace.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            {[
              { label: "Multi-Book", desc: "Organize by project" },
              { label: "Collaborate", desc: "Share with teams" },
              { label: "Insights", desc: "Smart analytics" },
            ].map((f) => (
              <div key={f.label} className="p-3 rounded-2xl glass">
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right auth form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold">ExpenseFlow</h1>
          </div>

          <AnimatePresence mode="wait">
            {showForgot ? (
              <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="glass-strong shadow-xl border-border/50">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-2xl font-display">Reset Password</CardTitle>
                    <CardDescription>Enter your email and we'll send you a reset link</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="forgot-email" type="email" placeholder="you@example.com" className="pl-10"
                          value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                      </div>
                    </div>
                    <Button className="w-full" onClick={handleForgotPassword} disabled={forgotLoading}>
                      {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Send Reset Link
                    </Button>
                    <button type="button" onClick={() => setShowForgot(false)}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center">
                      Back to sign in
                    </button>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div key="auth" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <Card className="glass-strong shadow-xl border-border/50">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-2xl font-display">
                      {isLogin ? "Welcome back" : "Create account"}
                    </CardTitle>
                    <CardDescription>
                      {isLogin ? "Sign in to your expense tracker" : "Start tracking your expenses today"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <AnimatePresence>
                        {!isLogin && (
                          <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="space-y-2 pb-1">
                              <Label htmlFor="name">Full Name</Label>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input id="name" placeholder="John Doe" className="pl-10"
                                  value={displayName} onChange={(e) => setDisplayName(e.target.value)} required={!isLogin} />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input id="email" type="email" placeholder="you@example.com" className="pl-10"
                            value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Password</Label>
                          {isLogin && (
                            <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                              className="text-xs text-primary hover:text-primary/80 transition-colors">
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" className="pl-10 pr-10"
                            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                          <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      {isLogin && (
                        <div className="flex items-center gap-2">
                          <Checkbox id="remember" />
                          <Label htmlFor="remember" className="text-sm text-muted-foreground font-normal cursor-pointer">
                            Remember me
                          </Label>
                        </div>
                      )}
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {isLogin ? "Sign In" : "Create Account"}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </form>
                    <div className="mt-6 text-center">
                      <button type="button" onClick={() => setIsLogin(!isLogin)}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <span className="text-primary font-medium">{isLogin ? "Sign up" : "Sign in"}</span>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
