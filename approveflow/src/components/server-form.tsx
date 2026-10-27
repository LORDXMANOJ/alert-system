"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { buttonClass, cn, type ButtonVariant } from "./ui";

export type ActionResult = { ok: true; message: string; href?: string } | { ok: false; error: string };

/**
 * Wraps a server action in a form. Shows a confirmation dialog for consequential actions,
 * reports the outcome as a toast, and refreshes the page data.
 */
export function ServerForm({
  action,
  children,
  submit,
  confirm,
  variant = "primary",
  className,
  resetOnSuccess = true,
  disabled,
  ariaLabel,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  submit: string;
  confirm?: { title: string; body: string; confirmLabel?: string };
  variant?: ButtonVariant;
  className?: string;
  resetOnSuccess?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);

  function run() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    setAsking(false);
    start(async () => {
      const res = await action(fd);
      if (res.ok) {
        toast.success(res.message);
        if (resetOnSuccess) form.reset();
        if (res.href) router.push(res.href);
        else router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <form
        ref={formRef}
        aria-label={ariaLabel}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm) setAsking(true);
          else run();
        }}
      >
        {children}
        <button type="submit" disabled={pending || disabled} className={buttonClass(variant, "md", "mt-1 w-full sm:w-auto")}>
          {pending ? "Working…" : submit}
        </button>
      </form>

      <AnimatePresence>
        {asking && confirm ? (
          <ConfirmDialog
            title={confirm.title}
            body={confirm.body}
            confirmLabel={confirm.confirmLabel ?? submit}
            danger={variant === "danger"}
            onCancel={() => setAsking(false)}
            onConfirm={run}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md bg-ink-2 p-6"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="flex items-start gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center ", danger ? "bg-late/10 text-late" : "bg-ink-3 text-tea")}>
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="confirm-title" className="text-base font-semibold text-fg">{title}</h2>
            <p id="confirm-body" className="mt-1 text-sm text-fg-3">{body}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClass("secondary")} autoFocus>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={buttonClass(danger ? "danger" : "primary")}>
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** A single-button action (no fields), with the same toast and refresh behaviour. */
export function ActionButton({
  action,
  label,
  variant = "secondary",
  size = "sm",
  confirm,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  confirm?: { title: string; body: string; confirmLabel?: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  function run() {
    setAsking(false);
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => (confirm ? setAsking(true) : run())}
        className={buttonClass(variant, size)}
      >
        {pending ? "Working…" : label}
      </button>
      <AnimatePresence>
        {asking && confirm ? (
          <ConfirmDialog
            title={confirm.title}
            body={confirm.body}
            confirmLabel={confirm.confirmLabel ?? label}
            danger={variant === "danger"}
            onCancel={() => setAsking(false)}
            onConfirm={run}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
