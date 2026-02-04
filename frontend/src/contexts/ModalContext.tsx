import { createContext, useContext, useState, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModalConfig {
  title?: string;
  description?: string;
  body?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  onClose?: () => void;
}

interface ModalContextValue {
  openModal: (config: ModalConfig) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ModalConfig>({});

  const openModal = (newConfig: ModalConfig) => {
    setConfig(newConfig);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    config.onClose?.();
    setConfig({});
  };

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className={sizeClasses[config.size || "md"]}>
          {config.title && (
            <DialogHeader>
              <DialogTitle>{config.title}</DialogTitle>
              {config.description && (
                <DialogDescription>{config.description}</DialogDescription>
              )}
            </DialogHeader>
          )}
          {config.body}
        </DialogContent>
      </Dialog>
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}

