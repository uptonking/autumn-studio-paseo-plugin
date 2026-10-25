import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { SettingsCard } from "@getpaseo/plugin/client/ui";
import {
  listAiTextStorageStats,
  revealAiTextPath,
  type AiTextStorageStatsRow,
} from "../../../../shared/contracts.js";
import {
  AiTextAction,
  AiTextHint,
  formatAiTextBytes,
  type AiTextTheme,
} from "./ui.js";
import {
  WorkspacePicker,
  type WorkspaceOption,
} from "./workspace-picker.js";

type SortKey = "file" | "versions" | "size" | "date";

const COLUMN = {
  file: { flex: 1, minWidth: 0 },
  versions: { width: 64 },
  size: { width: 72 },
  date: { width: 118 },
} as const;

const HEADERS: readonly {
  key: SortKey;
  label: string;
  align?: "right";
}[] = [
  { key: "file", label: "File" },
  { key: "versions", label: "Versions", align: "right" },
  { key: "size", label: "Size", align: "right" },
  { key: "date", label: "Last parsed", align: "right" },
];

/**
 * Remembers an explicit workspace pick for this session. The first visit
 * defaults to the workspace the latest chat lives in.
 */
let rememberedStatsWorkspaceId: string | null = null;

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

function StatsHeaderRow({
  sortKey,
  sortDesc,
  onSort,
  theme,
}: {
  sortKey: SortKey;
  sortDesc: boolean;
  onSort(key: SortKey): void;
  theme: AiTextTheme;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
      testID="autumn-studio-ai-text-stats-header"
    >
      {HEADERS.map((header) => {
        const active = header.key === sortKey;
        return (
          <Pressable
            key={header.key}
            accessibilityRole="button"
            onPress={() => onSort(header.key)}
            testID={`autumn-studio-ai-text-stats-header-${header.key}`}
            style={[COLUMN[header.key]]}
          >
            <Text
              style={{
                color: active
                  ? theme.colors.foreground
                  : theme.colors.foregroundMuted,
                fontSize: 10,
                fontWeight: active ? "800" : "600",
                textTransform: "uppercase",
                textAlign: header.align === "right" ? "right" : "left",
              }}
            >
              {`${header.label}${active ? (sortDesc ? " ↓" : " ↑") : ""}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatsRow({
  row,
  disabled,
  theme,
  onReveal,
  testID,
  revealTestID,
  divider,
}: {
  row: AiTextStorageStatsRow;
  disabled: boolean;
  theme: AiTextTheme;
  onReveal(): void;
  testID: string;
  revealTestID: string;
  divider: boolean;
}) {
  const value = {
    color: theme.colors.foreground,
    fontSize: 12,
    fontWeight: "600",
  } as const;
  return (
    <View
      style={{
        gap: 4,
        paddingVertical: 8,
        ...(divider
          ? { borderBottomWidth: 1, borderColor: theme.colors.border }
          : {}),
      }}
      testID={testID}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Text style={[value, COLUMN.file]} numberOfLines={1}>
          {row.sourceRelPath}
        </Text>
        <Text style={[value, { ...COLUMN.versions, textAlign: "right" }]}>
          {row.versionCount}
        </Text>
        <Text style={[value, { ...COLUMN.size, textAlign: "right" }]}>
          {formatAiTextBytes(row.totalBytes)}
        </Text>
        <Text
          style={[
            value,
            {
              ...COLUMN.date,
              textAlign: "right",
              color: theme.colors.foregroundMuted,
            },
          ]}
        >
          {formatTimestamp(row.lastParsedAt)}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          paddingLeft: 2,
        }}
      >
        <AiTextHint theme={theme}>
          {`${row.engines.join(", ") || "unknown engine"} · markdown ${formatAiTextBytes(row.markdownBytes)}, images ${formatAiTextBytes(row.assetBytes)}`}
        </AiTextHint>
        <AiTextAction
          label="↗"
          accessibilityLabel={`Show ${row.sourceRelPath} in file manager`}
          onPress={onReveal}
          disabled={disabled}
          theme={theme}
          testID={revealTestID}
        />
      </View>
    </View>
  );
}

interface StatsResult {
  outputRootDisplayPath: string;
  generatedAt: string;
  truncated: boolean;
  rows: AiTextStorageStatsRow[];
}

/**
 * Per-document storage list under the AI Text output root, laid out as a
 * table: workspace context first (searchable, defaulting to the workspace of
 * the latest chat), then totals, the filter bar, and rows sorted by clicking
 * the column headers. Sizes are recomputed on the server for every load and
 * every Recalculate press — there is no cache, so the button is a genuine
 * forced refresh.
 */
export function StorageDashboard({
  disabled,
  theme,
}: {
  disabled: boolean;
  theme: AiTextTheme;
}) {
  const paseo = usePaseo();
  const fetchStats = useRpc(listAiTextStorageStats);
  const reveal = useRpc(revealAiTextPath);

  // RPC bindings can change identity between renders; hold them in refs so
  // effects below don't re-run (and re-render) forever.
  const paseoRef = useRef(paseo);
  paseoRef.current = paseo;
  const fetchStatsRef = useRef(fetchStats);
  fetchStatsRef.current = fetchStats;

  const [workspaces, setWorkspaces] = useState<
    { id: string; label: string }[]
  >([]);
  /** Latest workspace activity per id, best effort. */
  const [activityById, setActivityById] = useState<Map<string, string>>(
    new Map(),
  );
  /** Latest chat update time per workspace id, best effort. */
  const [chatRecency, setChatRecency] = useState<Map<string, string>>(
    new Map(),
  );
  const [workspaceId, setWorkspaceId] = useState("");
  const [result, setResult] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const generationRef = useRef(0);

  const selectWorkspace = useCallback((id: string) => {
    rememberedStatsWorkspaceId = id;
    setWorkspaceId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Chats move between workspaces; the "last used" workspace is the one the
    // latest chat lives in, so ask the agent directory for the newest chats
    // and remember which workspace each appeared in first (sorted desc).
    paseoRef.current
      .agents.list({
        sort: [{ key: "updated_at", direction: "desc" }],
        filter: { includeArchived: true },
        page: { limit: 50 },
      })
      .then((list) => {
        if (cancelled) return;
        const recency = new Map<string, string>();
        for (const entry of list.entries) {
          const agent = entry.agent;
          const id = agent?.workspaceId;
          if (id && agent?.updatedAt && !recency.has(id)) {
            recency.set(id, agent.updatedAt);
          }
        }
        setChatRecency(recency);
      })
      .catch(() => {
        // Recency is best effort; the picker falls back to workspace order.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    paseoRef.current
      .workspaces.list()
      .then((list) => {
        if (cancelled) return;
        setWorkspaces(
          list.entries.map((workspace) => ({
            id: workspace.id,
            label: workspace.title || workspace.name || workspace.id,
          })),
        );
        setActivityById(
          new Map(
            list.entries.map((workspace) => [
              workspace.id,
              workspace.activityAt ?? "",
            ]),
          ),
        );
      })
      .catch(() => {
        // The stats section shows its own error when loading fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once recency data arrives, an unset selection defaults to the workspace
  // the latest chat lives in, then the most recently active one.
  useEffect(() => {
    if (workspaceId || workspaces.length === 0) return;
    const remembered = workspaces.find(
      (workspace) => workspace.id === rememberedStatsWorkspaceId,
    );
    if (remembered) {
      setWorkspaceId(remembered.id);
      return;
    }
    const byRecency = (id: string): string =>
      chatRecency.get(id) ?? activityById.get(id) ?? "";
    const best = [...workspaces].sort(
      (a, b) => byRecency(b.id).localeCompare(byRecency(a.id)),
    )[0];
    setWorkspaceId(best?.id ?? "");
  }, [workspaces, chatRecency, activityById, workspaceId]);

  const workspaceOptions: readonly WorkspaceOption[] = useMemo(
    () =>
      workspaces
        .map((workspace) => ({
          id: workspace.id,
          label: workspace.label,
          recencyKey:
            chatRecency.get(workspace.id) ??
            activityById.get(workspace.id) ??
            "",
        }))
        .sort((a, b) => b.recencyKey.localeCompare(a.recencyKey)),
    [workspaces, chatRecency, activityById],
  );

  const load = useCallback(
    async (refresh: boolean) => {
      if (!workspaceId) return;
      const generation = ++generationRef.current;
      setLoading(true);
      setError(null);
      try {
        const stats = await fetchStatsRef.current({
          workspaceId,
          ...(refresh ? { refresh: true } : {}),
        });
        if (generationRef.current !== generation) return;
        setResult({
          outputRootDisplayPath: stats.outputRootDisplayPath,
          generatedAt: stats.generatedAt,
          truncated: stats.truncated,
          rows: stats.rows,
        });
      } catch (cause) {
        if (generationRef.current !== generation) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not read AI Text storage.",
        );
      } finally {
        if (generationRef.current === generation) setLoading(false);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleHeaderSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDesc((desc) => !desc);
        return;
      }
      setSortKey(key);
      // Text sorts A→Z first; everything else newest/largest first.
      setSortDesc(key !== "file");
    },
    [sortKey],
  );

  const handleReveal = useCallback(
    (kind: "output-root" | "doc-folder", docPath?: string) => {
      if (!workspaceId) return;
      setMessage(null);
      reveal({ kind, workspaceId, ...(docPath ? { docPath } : {}) }).then(
        (response) => setMessage(response.message),
        (cause: unknown) =>
          setMessage(
            cause instanceof Error
              ? cause.message
              : "Could not open the folder.",
          ),
      );
    },
    [reveal, workspaceId],
  );

  const displayRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? result?.rows.filter(
          (row) =>
            row.sourceRelPath.toLowerCase().includes(needle) ||
            row.engines.some((engine) =>
              engine.toLowerCase().includes(needle),
            ),
        ) ?? []
      : (result?.rows ?? []);
    const sorted = filtered.sort((a, b) => {
      switch (sortKey) {
        case "file":
          return a.sourceRelPath.localeCompare(b.sourceRelPath);
        case "versions":
          return a.versionCount - b.versionCount;
        case "size":
          return a.totalBytes - b.totalBytes;
        default:
          return (a.lastParsedAt ?? "").localeCompare(b.lastParsedAt ?? "");
      }
    });
    return sortDesc ? sorted.reverse() : sorted;
  }, [result?.rows, filter, sortKey, sortDesc]);

  const totals = useMemo(() => {
    let totalBytes = 0;
    let totalVersions = 0;
    for (const row of result?.rows ?? []) {
      totalBytes += row.totalBytes;
      totalVersions += row.versionCount;
    }
    return { totalBytes, totalVersions };
  }, [result?.rows]);

  return (
    <SettingsCard>
      {workspaces.length > 1 ? (
        <WorkspacePicker
          value={workspaceId}
          options={workspaceOptions}
          disabled={disabled || loading}
          theme={theme}
          onSelect={selectWorkspace}
        />
      ) : null}

      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 12,
          gap: 2,
          marginBottom: 10,
        }}
      >
        <AiTextHint theme={theme} tone="default">
          {result
            ? `${formatAiTextBytes(totals.totalBytes)} · ${result.rows.length} ${result.rows.length === 1 ? "document" : "documents"} · ${totals.totalVersions} versions`
            : "Extracted text storage"}
        </AiTextHint>
        {result ? (
          <AiTextHint theme={theme}>
            {`${result.outputRootDisplayPath} — recalculated ${formatTimestamp(result.generatedAt)}`}
          </AiTextHint>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
          }}
        >
          <AiTextAction
            label={loading ? "Recalculating…" : "Recalculate"}
            onPress={() => void load(true)}
            disabled={disabled || loading || !workspaceId}
            theme={theme}
            testID="autumn-studio-ai-text-stats-refresh"
          />
          <AiTextAction
            label="Open folder"
            onPress={() => handleReveal("output-root")}
            disabled={disabled || !workspaceId}
            theme={theme}
            testID="autumn-studio-ai-text-stats-reveal-root"
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter files or engines…"
          placeholderTextColor={theme.colors.foregroundMuted}
          editable={!disabled}
          style={{
            backgroundColor: theme.colors.surface2,
            borderRadius: 7,
            paddingHorizontal: 10,
            paddingVertical: 6,
            color: theme.colors.foreground,
            fontSize: 12,
          }}
          testID="autumn-studio-ai-text-stats-filter"
        />
      </View>

      <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
        {result?.truncated ? (
          <AiTextHint theme={theme} tone="warning">
            Showing the first 500 documents.
          </AiTextHint>
        ) : null}
        {error ? (
          <AiTextHint theme={theme} tone="danger">
            {error}
          </AiTextHint>
        ) : null}
        {message ? <AiTextHint theme={theme}>{message}</AiTextHint> : null}
        {loading && !result ? (
          <AiTextHint theme={theme}>Reading AI Text storage…</AiTextHint>
        ) : null}
        {displayRows.length === 0 && !loading && !error && result ? (
          <AiTextHint theme={theme}>
            No extracted documents yet. Open a PDF and run AI Text Mode.
          </AiTextHint>
        ) : null}
      </View>

      {displayRows.length > 0 ? (
        <View style={{ paddingHorizontal: 12, marginTop: 10 }}>
          <StatsHeaderRow
            sortKey={sortKey}
            sortDesc={sortDesc}
            onSort={handleHeaderSort}
            theme={theme}
          />
          {displayRows.map((row, index) => (
            <StatsRow
              key={row.docFolderRelPath}
              row={row}
              disabled={disabled}
              theme={theme}
              onReveal={() => handleReveal("doc-folder", row.docFolderRelPath)}
              testID={`autumn-studio-ai-text-stats-row-${index}`}
              revealTestID={`autumn-studio-ai-text-stats-reveal-${index}`}
              divider={index < displayRows.length - 1}
            />
          ))}
        </View>
      ) : null}
    </SettingsCard>
  );
}
