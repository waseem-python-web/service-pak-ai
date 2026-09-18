import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Loader2 } from "lucide-react";
import { format } from "date-fns";

type Log = {
  id: string;
  agent: string;
  action: string;
  reasoning: string | null;
  data: any;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/logs")({ component: LogsPage });

function LogsPage() {
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => {
    supabase
      .from("agent_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setLogs((data as Log[]) ?? []));
  }, []);

  return (
    <div className="mx-auto max-w-md px-5 pt-8">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Agent trace</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Live log of every AI agent decision</p>

      <div className="mt-5 space-y-2">
        {logs === null && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {logs?.length === 0 && (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No agent activity yet.
          </div>
        )}
        {logs?.map((l) => (
          <div key={l.id} className="rounded-xl border bg-card p-3 font-mono text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="font-semibold text-primary">{l.agent}</span>
              <span>{format(new Date(l.created_at), "HH:mm:ss")}</span>
            </div>
            <p className="mt-1 text-foreground">{l.action}</p>
            {l.reasoning && <p className="mt-1 italic text-muted-foreground">→ {l.reasoning}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}