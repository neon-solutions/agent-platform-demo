import type { Prototype } from "@vibe/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@vibe/ui/components/dialog";
import { AppSettingsSections } from "@/components/app-settings";

/** The dashboard's settings surface: the shared sections in a dialog. */
export function AppSettingsDialog({
  proto,
  open,
  onOpenChange,
  onRenamed,
  onDeleted,
}: {
  proto: Prototype;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: (proto: Prototype) => void;
  onDeleted?: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg gap-5 overflow-hidden p-5 [&>section]:min-w-0" keepMounted>
        <DialogHeader className="gap-1">
          <DialogTitle className="text-base">App settings</DialogTitle>
          <DialogDescription>Name, database access, and teardown.</DialogDescription>
        </DialogHeader>
        <AppSettingsSections
          onDeleteArmed={() => onOpenChange(false)}
          onDeleted={onDeleted}
          onRenamed={onRenamed}
          proto={proto}
        />
      </DialogContent>
    </Dialog>
  );
}
