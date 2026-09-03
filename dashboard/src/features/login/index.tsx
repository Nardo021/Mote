import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { useAuth } from "../../hooks/useAuth.js";
import { translateError } from "../../lib/errors.js";
import { AuthLayout } from "../auth/auth-layout.js";

export function LoginPage() {
  const { t } = useTranslation();
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
      setError(translateError(cause, t, "login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("login.title")}>
      <Card className="mx-auto w-full max-w-sm gap-4">
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">
            {t("login.submit")}
          </CardTitle>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void onSubmit(event)}>
            <FieldGroup>
              {!configured ? (
                <Alert>
                  <AlertTitle>{t("login.setupRequired")}</AlertTitle>
                  <AlertDescription>
                    {t("login.unconfigured")}
                    <br />
                    <span className="mono">npm run cli -- admin create</span>
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="username">{t("login.username")}</FieldLabel>
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
                <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
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
                {t("login.submit")}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-sm text-muted-foreground">
            relay.yanze.me
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
