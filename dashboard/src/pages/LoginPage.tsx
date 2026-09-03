import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { MoteMark } from "../components/Icons.js";
import { useAuth } from "../hooks/useAuth.js";
import { friendlyError } from "../lib/errors.js";

export function LoginPage() {
  const { user, ready, configured, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (cause) {
      setError(friendlyError(cause, "Could not sign in."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <MoteMark />
            Mote Relay
          </CardTitle>
          <CardDescription>Administrator</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void onSubmit(event)}>
            <FieldGroup>
              {!configured ? (
                <Alert>
                  <AlertDescription>
                    No administrator configured. Create one using the Mote Relay
                    CLI.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  aria-invalid={error ? true : undefined}
                />
              </Field>
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  aria-invalid={error ? true : undefined}
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Sign In
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground">
          relay.yanze.me
        </CardFooter>
      </Card>
    </main>
  );
}
