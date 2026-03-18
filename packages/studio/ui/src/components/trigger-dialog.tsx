import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play } from "lucide-react";
import { api } from "@/lib/api";

interface TriggerDialogProps {
  workflowId: string;
  onTriggered?: (runId: string) => void;
}

export function TriggerDialog({
  workflowId,
  onTriggered,
}: TriggerDialogProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTrigger = async () => {
    setError(null);
    setLoading(true);

    try {
      const data = JSON.parse(input);
      const result = await api.trigger(workflowId, data);
      setOpen(false);
      setInput("{}");
      onTriggered?.(result.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Play className="h-3.5 w-3.5" />
          Trigger
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            Trigger: {workflowId}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wider">
              Input Data (JSON)
            </label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="font-mono text-[13px] min-h-[140px] bg-accent"
              placeholder="{}"
            />
          </div>
          {error && (
            <p className="text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/5 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleTrigger} disabled={loading} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              {loading ? "Triggering..." : "Trigger"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
