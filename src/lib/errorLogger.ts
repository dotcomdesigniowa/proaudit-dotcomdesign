import { supabase } from "@/integrations/supabase/client";

interface ErrorLogParams {
  page?: string;
  action?: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  severity?: "error" | "warn" | "info";
}

/**
 * Log an error to the error_logs table.
 * Fire-and-forget — never throws.
 */
export const logError = async ({
  page,
  action,
  message,
  stack,
  metadata,
  severity = "error",
}: ErrorLogParams) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("error_logs" as any).insert({
      user_id: user?.id ?? null,
      page: page ?? window.location.pathname,
      action: action ?? null,
      message,
      stack: stack ?? null,
      metadata: metadata ?? null,
      severity,
    } as any);
  } catch {
    // Silently fail — we don't want error logging to cause more errors
    console.error("[errorLogger] Failed to persist error:", message);
  }
};

/**
 * Install global handlers for uncaught errors and unhandled promise rejections.
 * Call once at app startup.
 */
export const installGlobalErrorHandlers = () => {
  window.addEventListener("error", (event) => {
    logError({
      action: "unhandled_error",
      message: event.message || "Unknown error",
      stack: event.error?.stack,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    logError({
      action: "unhandled_promise_rejection",
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      stack: reason?.stack,
    });
  });
};
