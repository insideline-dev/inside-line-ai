// DS-E4-F3-S1 — author structured dealbreaker rules:
// (field, operator, value[s], action). Sits alongside the narrative
// dealbreaker editor; the same versioned table backs both.

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ShieldAlert, ShieldQuestion, Loader2, Save, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useInvestorControllerGetStructuredDealbreakers,
  useInvestorControllerUpdateStructuredDealbreakers,
  useInvestorControllerGenerateStructuredDealbreakers,
} from "@/api/generated/investor/investor";

const STRING_FIELDS = ["industry", "stage", "geography", "raiseType"] as const;
const NUMERIC_FIELDS = ["fundingTarget", "valuation", "teamSize"] as const;

type StringField = (typeof STRING_FIELDS)[number];
type NumericField = (typeof NUMERIC_FIELDS)[number];
type RuleField = StringField | NumericField;

type StringOp = "in" | "not_in";
type NumericOp = "eq" | "lt" | "lte" | "gt" | "gte";

type Action = "reject" | "require_override";

interface StringRuleDraft {
  id: string;
  field: StringField;
  operator: StringOp;
  values: string[];
  action: Action;
  label?: string;
}

interface NumericRuleDraft {
  id: string;
  field: NumericField;
  operator: NumericOp;
  value: number;
  action: Action;
  label?: string;
}

type RuleDraft = StringRuleDraft | NumericRuleDraft;

const FIELD_LABELS: Record<RuleField, string> = {
  industry: "Industry",
  stage: "Stage",
  geography: "Geography",
  raiseType: "Raise type",
  fundingTarget: "Funding target",
  valuation: "Valuation",
  teamSize: "Team size",
};

const STRING_OP_LABELS: Record<StringOp, string> = {
  in: "is one of",
  not_in: "is NOT one of",
};

const NUMERIC_OP_LABELS: Record<NumericOp, string> = {
  eq: "=",
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
};

function isNumericField(field: RuleField): field is NumericField {
  return (NUMERIC_FIELDS as readonly string[]).includes(field);
}

function makeId(): string {
  return `rule-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyDraft(field: RuleField = "industry"): RuleDraft {
  if (isNumericField(field)) {
    return {
      id: makeId(),
      field,
      operator: "lt",
      value: 0,
      action: "require_override",
    };
  }
  return {
    id: makeId(),
    field,
    operator: "in",
    values: [],
    action: "reject",
  };
}

function rehydrateFromServer(raw: unknown[]): RuleDraft[] {
  return raw.map((r, idx) => {
    const obj = r as Record<string, unknown>;
    const field = (obj.field as RuleField) ?? "industry";
    const id =
      typeof obj.id === "string" && obj.id.length > 0 ? obj.id : `rule-${idx}`;
    const action: Action =
      obj.action === "require_override" ? "require_override" : "reject";
    const label = typeof obj.label === "string" ? obj.label : undefined;
    if (isNumericField(field)) {
      return {
        id,
        field,
        operator: (obj.operator as NumericOp) ?? "lt",
        value: typeof obj.value === "number" ? obj.value : 0,
        action,
        label,
      };
    }
    return {
      id,
      field,
      operator: (obj.operator as StringOp) ?? "in",
      values: Array.isArray(obj.values) ? (obj.values as string[]) : [],
      action,
      label,
    };
  });
}

function toServerPayload(rules: RuleDraft[]) {
  return rules.map((r) => {
    if (isNumericField(r.field)) {
      const numeric = r as NumericRuleDraft;
      return {
        id: numeric.id,
        field: numeric.field,
        operator: numeric.operator,
        value: numeric.value,
        action: numeric.action,
        label: numeric.label,
      };
    }
    const str = r as StringRuleDraft;
    return {
      id: str.id,
      field: str.field,
      operator: str.operator,
      values: str.values,
      action: str.action,
      label: str.label,
    };
  });
}

function normalizedRuleKey(rule: RuleDraft): string {
  return JSON.stringify({
    field: rule.field,
    operator: rule.operator,
    action: rule.action,
    value: isNumericField(rule.field)
      ? (rule as NumericRuleDraft).value
      : [...(rule as StringRuleDraft).values]
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean)
          .sort(),
  });
}

function mergeGeneratedRules(current: RuleDraft[], incoming: RuleDraft[]): RuleDraft[] {
  const merged = [...current];
  const keys = new Set(current.map((rule) => normalizedRuleKey(rule)));

  for (const rule of incoming) {
    const key = normalizedRuleKey(rule);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(rule);
  }

  return merged;
}

interface StructuredRulesEditorProps {
  exclusionNarrative?: string;
}

export function StructuredRulesEditor({
  exclusionNarrative,
}: StructuredRulesEditorProps) {
  const { toast } = useToast();
  const { data, isLoading, refetch } =
    useInvestorControllerGetStructuredDealbreakers();
  const remoteRules = useMemo(() => {
    const payload = data?.data as { rules?: unknown[] } | undefined;
    return rehydrateFromServer(payload?.rules ?? []);
  }, [data]);

  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);

  useEffect(() => {
    if (hasHydratedRemote && dirty) return;
    setRules(remoteRules);
    setDirty(false);
    setDraftGenerated(false);
    setHasHydratedRemote(true);
  }, [remoteRules, hasHydratedRemote, dirty]);

  const { mutate: save, isPending: isSaving } =
    useInvestorControllerUpdateStructuredDealbreakers({
      mutation: {
        onSuccess: () => {
          toast.success("Structured rules saved");
          setDirty(false);
          setDraftGenerated(false);
          setHasHydratedRemote(false);
          refetch();
        },
        onError: (error) => {
          toast.error("Failed to save rules", {
            description: (error as Error).message,
          });
        },
      },
    });

  const { mutate: generateDraft, isPending: isGenerating } =
    useInvestorControllerGenerateStructuredDealbreakers({
      mutation: {
        onSuccess: (response) => {
          const payload = response.data as { rules?: unknown[] } | undefined;
          const generatedRules = rehydrateFromServer(payload?.rules ?? []).map((rule) => ({
            ...rule,
            id: makeId(),
          }));
          setRules((prev) => mergeGeneratedRules(prev, generatedRules));
          setDirty(true);
          setDraftGenerated(generatedRules.length > 0);
          toast.success(
            generatedRules.length > 0
              ? "Draft rules added. Review before saving"
              : "No clear structured rules found",
          );
        },
        onError: (error) => {
          toast.error("Failed to generate draft rules", {
            description: (error as Error).message,
          });
        },
      },
    });

  const updateRule = (id: string, patch: Partial<RuleDraft>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? ({ ...r, ...patch } as RuleDraft) : r)),
    );
    setDirty(true);
  };

  const changeField = (id: string, field: RuleField) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        // Re-shape the draft when switching between string ↔ numeric fields.
        const fresh = emptyDraft(field);
        return { ...fresh, id: r.id, action: r.action };
      }),
    );
    setDirty(true);
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setDirty(true);
  };

  const addRule = () => {
    setRules((prev) => [...prev, emptyDraft()]);
    setDirty(true);
  };

  const handleSave = () => {
    save({ data: { rules: toServerPayload(rules) as never } });
  };

  const canGenerate = (exclusionNarrative?.trim().length ?? 0) >= 12;

  const handleGenerate = () => {
    const narrative = exclusionNarrative?.trim();
    if (!narrative || narrative.length < 12) return;
    generateDraft({ data: { narrative } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="h-5 w-5" />
          Structured dealbreaker rules
        </CardTitle>
        <CardDescription>
          Beyond the free-text exclusions above, author hard rules on any deal
          field. "Require override" rules surface as a flag in screening rather
          than a hard reject — useful when you want a partner to make the call.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/30 p-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Generate structured rules from your narrative</p>
            <p className="text-xs text-muted-foreground">
              Turn the anti-portfolio notes above into editable draft rules. Nothing is saved until you click Save rules.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            data-testid="generate-structured-rules"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate from narrative
          </Button>
        </div>

        {draftGenerated && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            AI draft added to this form. Review and edit anything you want before saving.
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rules…
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No structured rules yet. Add one to start gating deals on specific
            fields.
          </p>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-lg border bg-card p-4 space-y-3"
              data-testid={`structured-rule-${rule.id}`}
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Field
                  </Label>
                  <Select
                    value={rule.field}
                    onValueChange={(v) => changeField(rule.id, v as RuleField)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...STRING_FIELDS, ...NUMERIC_FIELDS].map((f) => (
                        <SelectItem key={f} value={f}>
                          {FIELD_LABELS[f as RuleField]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Operator
                  </Label>
                  <Select
                    value={rule.operator}
                    onValueChange={(v) =>
                      updateRule(rule.id, { operator: v as never })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {isNumericField(rule.field)
                        ? (Object.entries(NUMERIC_OP_LABELS) as [NumericOp, string][]).map(
                            ([op, lbl]) => (
                              <SelectItem key={op} value={op}>
                                {lbl}
                              </SelectItem>
                            ),
                          )
                        : (Object.entries(STRING_OP_LABELS) as [StringOp, string][]).map(
                            ([op, lbl]) => (
                              <SelectItem key={op} value={op}>
                                {lbl}
                              </SelectItem>
                            ),
                          )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Value{isNumericField(rule.field) ? "" : "s"}
                  </Label>
                  {isNumericField(rule.field) ? (
                    <Input
                      type="number"
                      value={(rule as NumericRuleDraft).value}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          value: Number(e.target.value) || 0,
                        } as never)
                      }
                    />
                  ) : (
                    <Input
                      placeholder="comma-separated, e.g. crypto, gambling"
                      value={(rule as StringRuleDraft).values.join(", ")}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          values: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        } as never)
                      }
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Action
                  </Label>
                  <Select
                    value={rule.action}
                    onValueChange={(v) =>
                      updateRule(rule.id, { action: v as Action })
                    }
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reject">
                        <span className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-destructive" />
                          Hard reject
                        </span>
                      </SelectItem>
                      <SelectItem value="require_override">
                        <span className="flex items-center gap-2">
                          <ShieldQuestion className="h-4 w-4 text-amber-500" />
                          Require partner override
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(rule.id)}
                  data-testid={`remove-rule-${rule.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRule}
            data-testid="add-structured-rule"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add rule
          </Button>
          <div className="flex items-center gap-2">
            {!canGenerate && (
              <p className="text-xs text-muted-foreground">
                Add a bit more anti-portfolio detail above to generate a draft.
              </p>
            )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isSaving}
              className="gap-2"
              data-testid="save-structured-rules"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save rules
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
