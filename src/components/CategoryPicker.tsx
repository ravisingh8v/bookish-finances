import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Category } from "@/hooks/useExpenses";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Plus, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";

type CategoryPickerProps = {
  id?: string;
  categories: Category[];
  value: string;
  onValueChange: (value: string) => void;
  onCreateCategory: (name: string) => Promise<Category>;
  onDeleteCategory: (categoryId: string) => Promise<string>;
  disabled?: boolean;
};

export function CategoryPicker({
  id,
  categories,
  value,
  onValueChange,
  onCreateCategory,
  onDeleteCategory,
  disabled = false,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const normalizedSearch = search.trim().toLowerCase();
  const selectedCategory = categories.find((category) => category.id === value);

  const filteredCategories = useMemo(
    () =>
      categories.filter((category) =>
        normalizedSearch
          ? category.name.toLowerCase().includes(normalizedSearch)
          : true,
      ),
    [categories, normalizedSearch],
  );

  const matchingCategory = categories.find(
    (category) => category.name.trim().toLowerCase() === normalizedSearch,
  );
  const canCreate = normalizedSearch.length > 0 && !matchingCategory;

  const getFallbackCategoryId = (excludeId?: string) => {
    const availableCategories = categories.filter(
      (category) => category.id !== excludeId,
    );
    return (
      availableCategories.find(
        (category) => category.name.trim().toLowerCase() === "other",
      )?.id ??
      availableCategories[0]?.id ??
      ""
    );
  };

  const handleCreate = async () => {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    try {
      const createdCategory = await onCreateCategory(search.trim());
      onValueChange(createdCategory.id);
      setSearch("");
      setOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (deletingId) return;
    setDeletingId(categoryId);
    try {
      await onDeleteCategory(categoryId);
      if (value === categoryId) {
        onValueChange(getFallbackCategoryId(categoryId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-11 w-full justify-between bg-background px-3 font-normal"
        >
          <span
            className={cn(
              "truncate text-left",
              !selectedCategory && "text-muted-foreground",
            )}
          >
            {selectedCategory?.name ?? "Select category"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(var(--radix-popover-trigger-width),22rem)] max-w-[calc(100vw-2rem)] overflow-hidden bg-white p-0"
      >
        <div className="border-b bg-white p-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (canCreate) {
                  event.preventDefault();
                  void handleCreate();
                }
              }
            }}
            placeholder="Search or type to create"
            className="h-10 bg-white"
          />
        </div>
        <ScrollArea
          className="h-[min(14rem,calc(100vh-18rem))] w-full touch-pan-y"
          onWheelCapture={(event) => event.stopPropagation()}
          onTouchMoveCapture={(event) => event.stopPropagation()}
        >
          <div className="p-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={isCreating}
                className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors sm:hover:bg-accent disabled:opacity-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="flex-1 truncate">
                  Create "{search.trim()}"
                </span>
              </button>
            )}

            {filteredCategories.map((category) => (
              <div
                key={category.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onValueChange(category.id);
                  setOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onValueChange(category.id);
                    setOpen(false);
                  }
                }}
                className={cn(
                  "mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors sm:hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
                  value === category.id && "bg-accent text-accent-foreground",
                )}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: `${category.color}20`,
                    color: category.color,
                  }}
                >
                  <Tag className="h-4 w-4" />
                </span>
                <span className="flex-1 truncate">{category.name}</span>
                {value === category.id && (
                  <Check className="h-4 w-4 shrink-0" />
                )}
                {!category.is_default && (
                  <button
                    type="button"
                    aria-label={`Delete ${category.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(category.id);
                    }}
                    disabled={deletingId === category.id}
                    className="rounded-full p-1 text-muted-foreground transition-colors sm:hover:bg-destructive/10 sm:hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {filteredCategories.length === 0 &&
              !canCreate &&
              normalizedSearch && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matching categories
                </div>
              )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
