import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY"];

interface EditBookFormProps {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  currency: string;
  setCurrency: (value: string) => void;
  color: string;
  setColor: (value: string) => void;
  includeInReports: boolean;
  setIncludeInReports: (value: boolean) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  buttonText?: string;
  colors?: string[];
}

export function EditBookForm({
  name,
  setName,
  description,
  setDescription,
  currency,
  setCurrency,
  color,
  setColor,
  includeInReports,
  setIncludeInReports,
  onSave,
  isSaving,
  buttonText = "Save Changes",
  colors = [
    "#10B981",
    "#3B82F6",
    "#8B5CF6",
    "#F59E0B",
    "#EF4444",
    "#EC4899",
    "#06B6D4",
  ],
}: EditBookFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Label htmlFor="book-name" className="text-sm font-medium">
          Name
        </Label>
        <Input
          id="book-name"
          placeholder="e.g., Trip with Friends"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-3">
        <Label htmlFor="book-desc" className="text-sm font-medium">
          Description (optional)
        </Label>
        <Textarea
          id="book-desc"
          placeholder="What's this book for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>
      <div className="space-y-3">
        <Label htmlFor="book-currency" className="text-sm font-medium">
          Currency
        </Label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger id="book-currency" className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Color</Label>
        <div className="flex flex-wrap gap-3">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-10 h-10 rounded-full transition-transform border-2 ${
                color === c
                  ? "ring-2 ring-primary scale-110 border-primary"
                  : "sm:hover:scale-105 border-border"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <Label htmlFor="book-include-reports" className="text-sm font-medium">
          Include in Reports
        </Label>
        <Switch
          id="book-include-reports"
          checked={includeInReports}
          onCheckedChange={setIncludeInReports}
        />
      </div>
      <div className="flex gap-3 pt-2">
        <Button
          className="w-full h-11 sm:w-auto"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {buttonText}
        </Button>
      </div>
    </div>
  );
}
