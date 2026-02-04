import { useRef } from "react";
import { useModal } from "@/contexts/ModalContext";
import { Button } from "@/components/ui/button";

interface ConfirmationOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
}

export function useConfirmation() {
  const { openModal, closeModal } = useModal();
  const resolvePromiseRef = useRef<((value: boolean) => void) | null>(null);

  const showConfirmation = (options: ConfirmationOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      resolvePromiseRef.current = resolve;

      const handleConfirm = () => {
        if (resolvePromiseRef.current) {
          resolvePromiseRef.current(true);
          resolvePromiseRef.current = null;
        }
        closeModal();
      };

      const handleCancel = () => {
        if (resolvePromiseRef.current) {
          resolvePromiseRef.current(false);
          resolvePromiseRef.current = null;
        }
        closeModal();
      };

      const handleClose = () => {
        if (resolvePromiseRef.current) {
          resolvePromiseRef.current(false);
          resolvePromiseRef.current = null;
        }
        closeModal();
      };

      const {
        title = "Are you sure?",
        description = "This action cannot be undone.",
        confirmText = "Continue",
        cancelText = "Cancel",
        variant = "destructive",
      } = options;

      setTimeout(() => {
        try {
          const active = document.activeElement as HTMLElement | null;
          if (active && typeof active.blur === "function") active.blur();
        } catch {}

        openModal({
          title,
          description,
          body: (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel}>
                {cancelText}
              </Button>
              <Button variant={variant} onClick={handleConfirm}>
                {confirmText}
              </Button>
            </div>
          ),
          size: "sm",
          onClose: handleClose,
        });
      }, 0);
    });
  };

  return { showConfirmation };
}

