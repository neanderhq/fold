import { Check } from "lucide-react";
import { appearances, type FormSchema } from "@/lib/form-schema";

const labels = { classic: { name: "Classic", detail: "Clean blue · Inter" }, paper: { name: "Paper", detail: "Warm ink · Georgia" }, meadow: { name: "Meadow", detail: "Calm green · Inter" } };

export function AppearancePicker({ value, onChange, disabled }: { value: FormSchema["appearance"]; onChange: (value: FormSchema["appearance"]) => void; disabled: boolean }) {
  return <fieldset><legend className="mb-3 text-sm font-medium">Form appearance</legend><div className="fold-appearance-options">{appearances.map(appearance => <button key={appearance} type="button" className="fold-appearance-option fold-form-surface" data-form-appearance={appearance} aria-label={labels[appearance].name} aria-pressed={(value ?? "classic") === appearance} disabled={disabled} onClick={() => onChange(appearance)}>
    <span className="fold-appearance-sample" aria-hidden="true">Aa<span />{(value ?? "classic") === appearance && <Check />}</span><strong>{labels[appearance].name}</strong><span>{labels[appearance].detail}</span>
  </button>)}</div><p className="mt-3 text-xs text-muted-foreground">Preview updates here. Republish to apply changes to your live form.</p></fieldset>;
}
