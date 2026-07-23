import { useState } from "react";
import { AuthForm, type AuthFormValues, type AuthMode } from "@/components/auth-form/auth-form";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@vibe/ui/components/dialog";
import { authClient } from "@/lib/auth-client";

/**
 * In-place auth: the landing keeps the user's prompt on screen while they
 * create an account or sign in, then continues the launch immediately.
 */
export function AuthDialog({
  open,
  onOpenChange,
  onAuthed,
  defaultMode = "sign-up",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthed: () => void;
  defaultMode?: AuthMode;
}) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit({ email, password, name }: AuthFormValues) {
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email,
              password,
              name: name || email.split("@")[0] || email,
            })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message || "Something went wrong");
        return;
      }
      onAuthed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm p-6">
        <DialogTitle className="sr-only">
          {mode === "sign-up" ? "Create your account" : "Sign in"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Continue to start building your app.
        </DialogDescription>
        <AuthForm
          description={
            mode === "sign-up" ? "Create an account to start building." : "Sign in to continue."
          }
          error={error}
          isBusy={busy}
          mode={mode}
          onModeChange={setMode}
          onSubmit={onSubmit}
          variant="bare"
        />
      </DialogContent>
    </Dialog>
  );
}
