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
            "group toast !opacity-100 !backdrop-blur-none " +
            "group-[.toaster]:bg-background group-[.toaster]:text-foreground " +
            "group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "!border-emerald-300 !bg-emerald-100 !text-emerald-900 " +
            "dark:!border-emerald-800 dark:!bg-emerald-950 dark:!text-emerald-100",
          error:
            "!border-red-300 !bg-red-100 !text-red-900 " +
            "dark:!border-red-800 dark:!bg-red-950 dark:!text-red-100",
          warning:
            "!border-amber-300 !bg-amber-100 !text-amber-900 " +
            "dark:!border-amber-800 dark:!bg-amber-950 dark:!text-amber-100",
          info:
            "!border-sky-300 !bg-sky-100 !text-sky-900 " +
            "dark:!border-sky-800 dark:!bg-sky-950 dark:!text-sky-100",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
