ALTER TABLE public.expenses ALTER COLUMN date DROP DEFAULT;
ALTER TABLE public.expenses ALTER COLUMN date TYPE timestamp with time zone USING date::timestamp with time zone;
ALTER TABLE public.expenses ALTER COLUMN date SET DEFAULT now();