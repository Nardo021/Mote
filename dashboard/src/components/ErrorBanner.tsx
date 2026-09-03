import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <Alert variant="destructive" className="mb-5">
      <AlertDescription>{message}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
