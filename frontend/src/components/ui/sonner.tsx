import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ richColors = true, ...props }: ToasterProps) => {
  return (
    <Sonner
      richColors={richColors}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "!border-emerald-500/35 !bg-emerald-500/10 !text-emerald-900 " +
            "dark:!bg-emerald-500/15 dark:!text-emerald-200",
          error:
            "!border-destructive/40 !bg-destructive/10 !text-destructive",
          warning:
            "!border-amber-500/35 !bg-amber-500/10 !text-amber-900 " +
            "dark:!bg-amber-500/15 dark:!text-amber-200",
          info:
            "!border-sky-500/35 !bg-sky-500/10 !text-sky-900 " +
            "dark:!bg-sky-500/15 dark:!text-sky-200",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
