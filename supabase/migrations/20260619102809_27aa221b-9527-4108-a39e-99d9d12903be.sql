REVOKE ALL ON FUNCTION public.is_book_owner(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_book_owner(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_book_owner(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.is_book_member(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_book_member(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_book_member(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_book_owner(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_book_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;